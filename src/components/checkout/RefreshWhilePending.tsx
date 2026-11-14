"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Re-renders the (server) page every few seconds while a payment confirmation is still on its way. */
export function RefreshWhilePending({ intervalMs = 3000 }: { intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = window.setInterval(() => router.refresh(), intervalMs);
    return () => window.clearInterval(id);
  }, [router, intervalMs]);
  return null;
}
