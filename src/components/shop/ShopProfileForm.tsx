"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { TextArea, TextField } from "@/components/ui/TextField";
import { Thumb } from "@/components/ui/Thumb";
import { apiFetch, fieldError, type ApiError } from "@/lib/api-client";
import type { ShopProfile } from "@/server/shops/profile";
import { ShopOpenToggle } from "./ShopOpenToggle";

const MAX_LOGO_BYTES = 5 * 1024 * 1024;

/** Edit name, location, description and logo (multipart PATCH), plus the open/closed switch. */
export function ShopProfileForm({ shop }: { shop: ShopProfile }) {
  const router = useRouter();
  const [error, setError] = useState<ApiError | null>(null);
  const [logoError, setLogoError] = useState<string | undefined>();
  const [preview, setPreview] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState(shop.logoUrl);
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );

  function onLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setLogoError(undefined);
    setPreview(null);
    if (!file) return;
    if (file.size > MAX_LOGO_BYTES) {
      setLogoError("Images must be 5 MB or smaller.");
      e.target.value = "";
      return;
    }
    setPreview(URL.createObjectURL(file));
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (logoError) return;
    const formEl = e.currentTarget;
    setPending(true);
    setError(null);
    setSaved(false);
    const result = await apiFetch<{ shop: ShopProfile }>(`/api/shops/${shop.id}`, { method: "PATCH", body: new FormData(formEl) });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setLogoUrl(result.data.shop.logoUrl);
    setPreview(null);
    const logoInput = formEl.elements.namedItem("logo");
    if (logoInput instanceof HTMLInputElement) logoInput.value = "";
    setSaved(true);
    router.refresh(); // the sidebar shows the shop name
  }

  const serverLogoError = error?.field === "logo" ? error.message : undefined;

  return (
    <div className="max-w-xl space-y-6">
      <section aria-label="Open or closed" className="rounded-xl border border-slate-200 bg-white p-4">
        <ShopOpenToggle shopId={shop.id} isOpen={shop.isOpen} />
        <p className="mt-1 text-sm text-slate-500">When closed, customers can still see your menu but cannot order.</p>
      </section>
      <form onSubmit={onSubmit} className="space-y-4 rounded-xl border border-slate-200 bg-white p-4" noValidate>
        {saved && <Alert tone="success">Shop profile saved.</Alert>}
        {error && !error.fieldErrors && error.field !== "logo" && <Alert tone="error">{error.message}</Alert>}
        <TextField label="Shop name" name="name" required maxLength={80} defaultValue={shop.name} error={fieldError(error, "name")} />
        <TextField
          label="Location in the market"
          name="location"
          required
          maxLength={120}
          defaultValue={shop.location}
          placeholder="e.g. Stall 4, near SAC"
          error={fieldError(error, "location")}
        />
        <TextArea
          label="Description"
          name="description"
          rows={3}
          maxLength={500}
          defaultValue={shop.description}
          error={fieldError(error, "description")}
        />
        <div className="space-y-1.5">
          <label htmlFor="shop-profile-logo" className="block text-sm font-medium text-slate-700">
            Logo (leave empty to keep the current one)
          </label>
          <div className="flex items-center gap-3">
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element -- local object-URL preview, nothing to optimise
              <img src={preview} alt="New logo preview" className="size-14 shrink-0 rounded-xl border border-slate-200 object-cover" />
            ) : (
              <Thumb src={logoUrl} alt="Current logo" />
            )}
            <input
              id="shop-profile-logo"
              name="logo"
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              onChange={onLogoChange}
              aria-describedby="shop-profile-logo-help"
              className="block w-full min-w-0 text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-orange-50 file:px-3 file:py-2 file:font-semibold file:text-orange-700 hover:file:bg-orange-100"
            />
          </div>
          <p id="shop-profile-logo-help" className={`text-xs ${logoError || serverLogoError ? "text-red-600" : "text-slate-500"}`}>
            {logoError ?? serverLogoError ?? "PNG, JPEG, WebP or GIF, up to 5 MB."}
          </p>
        </div>
        <Button type="submit" loading={pending}>
          Save profile
        </Button>
      </form>
    </div>
  );
}
