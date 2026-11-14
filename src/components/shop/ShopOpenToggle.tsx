"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Switch } from "@/components/ui/Switch";
import { apiFetch } from "@/lib/api-client";

/** Open / closed switch for the shop. Closed shops stay visible but customers cannot add to cart. */
export function ShopOpenToggle({ shopId, isOpen }: { shopId: string; isOpen: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(isOpen);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function change(next: boolean) {
    setPending(true);
    setError(null);
    setOpen(next);
    const result = await apiFetch<{ shop: { isOpen: boolean } }>(`/api/shops/${shopId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isOpen: next }),
    });
    setPending(false);
    if (result.ok) {
      setOpen(result.data.shop.isOpen);
      router.refresh();
    } else {
      setOpen(!next);
      setError(result.error.message);
    }
  }

  return (
    <div>
      <Switch checked={open} onChange={change} disabled={pending} label="Shop open for orders">
        <span className={open ? "text-emerald-700" : "text-slate-600"}>{open ? "Open for orders" : "Closed"}</span>
      </Switch>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
