"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch } from "@/lib/api-client";

export function LogoutButton({ loginPath, className = "" }: { loginPath: string; className?: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function logout() {
    setPending(true);
    await apiFetch("/api/auth/logout", { method: "POST" });
    router.replace(loginPath);
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={logout}
      disabled={pending}
      className={`inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-medium text-slate-700 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-orange-600 disabled:opacity-60 ${className}`}
    >
      <LogOut aria-hidden="true" className="size-4" />
      Log out
    </button>
  );
}
