"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { fieldError, postJson, type ApiError } from "@/lib/api-client";
import { safeNextPath, type Portal } from "@/lib/portals";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";

interface LoginFormProps {
  portal: Portal;
  next?: string;
  signupHref?: string;
}

export function LoginForm({ portal, next, signupHref }: LoginFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<ApiError | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const result = await postJson<{ redirectTo: string }>("/api/auth/login", { email, password, portal });
    if (!result.ok) {
      setError(result.error);
      setPending(false);
      return;
    }
    router.replace(safeNextPath(next) ?? result.data.redirectTo);
    router.refresh();
  }

  const wrongPortal = error?.code === "WRONG_PORTAL" && typeof error.loginPath === "string" ? error.loginPath : null;

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {error && !error.fieldErrors && (
        <Alert tone={wrongPortal ? "warning" : "error"}>
          <p>{error.message}</p>
          {wrongPortal && (
            <p className="mt-1">
              <Link href={wrongPortal} className="font-semibold underline">
                Go to the right login page
              </Link>
            </p>
          )}
        </Alert>
      )}
      <TextField
        label="Email"
        type="email"
        name="email"
        autoComplete="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        error={fieldError(error, "email")}
      />
      <TextField
        label="Password"
        type="password"
        name="password"
        autoComplete="current-password"
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        error={fieldError(error, "password")}
      />
      <Button type="submit" loading={pending} className="w-full">
        Log in
      </Button>
      {signupHref && (
        <p className="text-center text-sm text-slate-600">
          New here?{" "}
          <Link href={signupHref} className="font-semibold text-orange-700 hover:underline">
            Create an account
          </Link>
        </p>
      )}
    </form>
  );
}
