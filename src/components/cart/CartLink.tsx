"use client";

import { ShoppingBag } from "lucide-react";
import Link from "next/link";
import { cartItemCount } from "@/lib/cart/cart";
import { useCartHydrated, useCartStore } from "@/lib/cart/store";

/** Cart button in the customer top bar, with the item count once the persisted cart has loaded. */
export function CartLink({ active }: { active: boolean }) {
  const hydrated = useCartHydrated();
  const count = useCartStore((s) => cartItemCount(s));
  const shown = hydrated ? count : 0;
  return (
    <Link
      href="/cart"
      aria-current={active ? "page" : undefined}
      aria-label={shown > 0 ? `Cart, ${shown} item${shown === 1 ? "" : "s"}` : "Cart"}
      className={`relative inline-flex size-10 items-center justify-center rounded-lg focus-visible:outline-2 focus-visible:outline-orange-600 ${
        active ? "bg-orange-50 text-orange-700" : "text-slate-600 hover:bg-slate-100"
      }`}
    >
      <ShoppingBag aria-hidden="true" className="size-5" />
      {shown > 0 && (
        <span
          aria-hidden="true"
          className="absolute -top-0.5 -right-0.5 flex min-w-5 items-center justify-center rounded-full bg-orange-600 px-1 text-[11px] leading-5 font-bold text-white"
        >
          {shown > 99 ? "99+" : shown}
        </span>
      )}
    </Link>
  );
}
