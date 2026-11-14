"use client";

import { ImagePlus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiFetch, fieldError, type ApiError } from "@/lib/api-client";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { TextArea, TextField } from "@/components/ui/TextField";

const MAX_LOGO_BYTES = 5 * 1024 * 1024;

export function ShopSignupForm() {
  const router = useRouter();
  const [error, setError] = useState<ApiError | null>(null);
  const [logoError, setLogoError] = useState<string | undefined>();
  const [preview, setPreview] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

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
    setPending(true);
    setError(null);
    const result = await apiFetch<{ redirectTo: string }>("/api/auth/shop-signup", {
      method: "POST",
      body: new FormData(e.currentTarget),
    });
    if (!result.ok) {
      setError(result.error);
      setPending(false);
      return;
    }
    router.replace(result.data.redirectTo);
    router.refresh();
  }

  const serverLogoError = error?.field === "logo" ? error.message : undefined;
  const logoMessage =
    logoError ?? serverLogoError ?? "PNG, JPEG, WebP or GIF, up to 5 MB. We will generate one if you skip this.";

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      {error && <Alert tone="error">{error.message}</Alert>}
      <fieldset className="space-y-4">
        <legend className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Your account</legend>
        <TextField label="Your name" name="name" autoComplete="name" required error={fieldError(error, "name")} />
        <TextField label="Email" type="email" name="email" autoComplete="email" required error={fieldError(error, "email")} />
        <TextField label="Phone (optional)" type="tel" name="phone" autoComplete="tel" error={fieldError(error, "phone")} />
        <TextField
          label="Password"
          type="password"
          name="password"
          autoComplete="new-password"
          required
          hint="At least 8 characters."
          error={fieldError(error, "password")}
        />
      </fieldset>
      <fieldset className="space-y-4">
        <legend className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Your shop</legend>
        <TextField label="Shop name" name="shopName" required error={fieldError(error, "shopName")} />
        <TextField
          label="Location in the market"
          name="location"
          required
          placeholder="e.g. Stall 4, near SAC"
          error={fieldError(error, "location")}
        />
        <TextArea
          label="Description (optional)"
          name="shopDescription"
          rows={3}
          maxLength={500}
          error={fieldError(error, "shopDescription")}
        />
        <div className="space-y-1.5">
          <label htmlFor="shop-logo" className="block text-sm font-medium text-slate-700">
            Logo (optional)
          </label>
          <div className="flex items-center gap-3">
            <span className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
              {preview ? (
                // eslint-disable-next-line @next/next/no-img-element -- local object-URL preview, nothing to optimise
                <img src={preview} alt="Logo preview" className="size-full object-cover" />
              ) : (
                <ImagePlus aria-hidden="true" className="size-6 text-slate-400" />
              )}
            </span>
            <input
              id="shop-logo"
              name="logo"
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              onChange={onLogoChange}
              aria-describedby="shop-logo-help"
              className="block w-full min-w-0 text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-orange-50 file:px-3 file:py-2 file:font-semibold file:text-orange-700 hover:file:bg-orange-100"
            />
          </div>
          <p id="shop-logo-help" className={`text-xs ${logoError || serverLogoError ? "text-red-600" : "text-slate-500"}`}>
            {logoMessage}
          </p>
        </div>
      </fieldset>
      <Button type="submit" loading={pending} className="w-full">
        Register shop
      </Button>
      <p className="text-center text-sm text-slate-600">
        Already registered?{" "}
        <Link href="/shop/login" className="font-semibold text-orange-700 hover:underline">
          Log in to your shop
        </Link>
      </p>
    </form>
  );
}
