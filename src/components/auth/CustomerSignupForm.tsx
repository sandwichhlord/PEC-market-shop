"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { fieldError, postJson, type ApiError } from "@/lib/api-client";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";

export function CustomerSignupForm() {
  const router = useRouter();
  const [error, setError] = useState<ApiError | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const result = await postJson<{ redirectTo: string }>("/api/auth/signup", Object.fromEntries(form));
    if (!result.ok) {
      setError(result.error);
      setPending(false);
      return;
    }
    router.replace(result.data.redirectTo);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {error && <Alert tone="error">{error.message}</Alert>}
      <TextField label="Full name" name="name" autoComplete="name" required error={fieldError(error, "name")} />
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
      <Button type="submit" loading={pending} className="w-full">
        Create account
      </Button>
      <p className="text-center text-sm text-slate-600">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-orange-700 hover:underline">
          Log in
        </Link>
      </p>
    </form>
  );
}
