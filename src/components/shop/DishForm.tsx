"use client";

import { ImagePlus } from "lucide-react";
import { useEffect, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { TextArea, TextField } from "@/components/ui/TextField";
import { apiFetch, fieldError, type ApiError } from "@/lib/api-client";
import { MAX_PREP_MINUTES, rupeesToPaise } from "@/lib/validation/shop-portal";
import type { OwnerDish } from "@/server/shops/menu";

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

interface DishFormProps {
  shopId: string;
  /** The dish being edited, or null to add a new one. */
  dish: OwnerDish | null;
  onSaved: (dish: OwnerDish) => void;
}

const paiseToRupeesInput = (paise: number) => (paise % 100 === 0 ? String(paise / 100) : (paise / 100).toFixed(2));

/** Add / edit a dish: name, description, price (₹), prep time, photo. Sends multipart to the menu API. */
export function DishForm({ shopId, dish, onSaved }: DishFormProps) {
  const [error, setError] = useState<ApiError | null>(null);
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );

  function onPhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setPreview(null);
    setLocalErrors((errs) => {
      const next = { ...errs };
      delete next.photo;
      return next;
    });
    if (!file) return;
    if (file.size > MAX_PHOTO_BYTES) {
      setLocalErrors((errs) => ({ ...errs, photo: "Images must be 5 MB or smaller." }));
      e.target.value = "";
      return;
    }
    setPreview(URL.createObjectURL(file));
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const pricePaise = rupeesToPaise(String(form.get("price") ?? ""));
    if (pricePaise === null) {
      setLocalErrors((errs) => ({ ...errs, price: "Enter a price in rupees, e.g. 40 or 42.50." }));
      return;
    }
    if (localErrors.photo) return;
    setLocalErrors({});
    form.delete("price");
    form.set("pricePaise", String(pricePaise));
    setPending(true);
    setError(null);
    const result = await apiFetch<{ dish: OwnerDish }>(
      dish ? `/api/shops/${shopId}/menu/${dish.id}` : `/api/shops/${shopId}/menu`,
      { method: dish ? "PATCH" : "POST", body: form },
    );
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onSaved(result.data.dish);
  }

  const photoError = localErrors.photo ?? (error?.field === "photo" ? error.message : undefined);
  const currentPhoto = preview ?? dish?.photoUrl ?? null;

  return (
    <form onSubmit={onSubmit} className="space-y-4 pt-2" noValidate>
      {error && !error.fieldErrors && error.field !== "photo" && <Alert tone="error">{error.message}</Alert>}
      <TextField label="Dish name" name="name" required defaultValue={dish?.name} maxLength={80} error={fieldError(error, "name")} />
      <TextArea
        label="Description (optional)"
        name="description"
        rows={2}
        maxLength={500}
        defaultValue={dish?.description}
        error={fieldError(error, "description")}
      />
      <div className="grid grid-cols-2 gap-3">
        <TextField
          label="Price (₹)"
          name="price"
          inputMode="decimal"
          required
          defaultValue={dish ? paiseToRupeesInput(dish.pricePaise) : ""}
          error={localErrors.price ?? fieldError(error, "pricePaise")}
        />
        <TextField
          label="Prep time (min)"
          name="prepTimeMinutes"
          type="number"
          inputMode="numeric"
          min={1}
          max={MAX_PREP_MINUTES}
          required
          defaultValue={dish?.prepTimeMinutes ?? 10}
          error={fieldError(error, "prepTimeMinutes")}
        />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="dish-photo" className="block text-sm font-medium text-slate-700">
          Photo {dish ? "(leave empty to keep the current one)" : "(optional)"}
        </label>
        <div className="flex items-center gap-3">
          <span className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
            {currentPhoto ? (
              // eslint-disable-next-line @next/next/no-img-element -- object-URL preview or an /api/uploads image (may be SVG)
              <img src={currentPhoto} alt="Dish photo preview" className="size-full object-cover" />
            ) : (
              <ImagePlus aria-hidden="true" className="size-6 text-slate-400" />
            )}
          </span>
          <input
            id="dish-photo"
            name="photo"
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={onPhotoChange}
            aria-describedby="dish-photo-help"
            className="block w-full min-w-0 text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-orange-50 file:px-3 file:py-2 file:font-semibold file:text-orange-700 hover:file:bg-orange-100"
          />
        </div>
        <p id="dish-photo-help" className={`text-xs ${photoError ? "text-red-600" : "text-slate-500"}`}>
          {photoError ?? "PNG, JPEG, WebP or GIF, up to 5 MB."}
        </p>
      </div>
      <Button type="submit" loading={pending} className="w-full">
        {dish ? "Save changes" : "Add dish"}
      </Button>
    </form>
  );
}
