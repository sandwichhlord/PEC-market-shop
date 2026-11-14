"use client";

import { Minus, Plus, ShoppingBag, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button, buttonClasses } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Sheet } from "@/components/ui/Sheet";
import { Skeleton } from "@/components/ui/Skeleton";
import { Thumb } from "@/components/ui/Thumb";
import { postJson, type ApiError } from "@/lib/api-client";
import { MAX_LINE_QUANTITY, cartItemCount, cartSubtotalPaise } from "@/lib/cart/cart";
import { useCartHydrated, useCartStore } from "@/lib/cart/store";
import { formatPaise } from "@/lib/money";

interface CheckoutStarted {
  orderId: string;
  checkoutUrl: string;
}

interface PriceUpdate {
  menuItemId: string;
  pricePaise: number;
}

const stepperClasses =
  "inline-flex size-10 items-center justify-center rounded-lg text-slate-700 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-orange-600 disabled:cursor-not-allowed disabled:text-slate-300";

/** The cart page: lines with quantity +/−, remove, subtotal, clear (with confirm), and "Pay" → checkout. */
export function CartView({ notice }: { notice?: string }) {
  const hydrated = useCartHydrated();
  const cart = useCartStore();
  const [error, setError] = useState<ApiError | null>(null);
  const [blocked, setBlocked] = useState<Set<string>>(new Set());
  const [paying, setPaying] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  if (!hydrated) {
    return (
      <div aria-busy="true" aria-label="Loading cart" className="space-y-3">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-28 w-full" />
      </div>
    );
  }

  if (cart.lines.length === 0) {
    return (
      <EmptyState icon={ShoppingBag} title="Your cart is empty">
        <p>Pick a shop and add a few dishes.</p>
        <Link href="/shops" className={buttonClasses("primary", "mt-4")}>
          Browse shops
        </Link>
      </EmptyState>
    );
  }

  const count = cartItemCount(cart);
  const subtotal = cartSubtotalPaise(cart);

  const pay = async () => {
    if (!cart.shopId) return;
    setPaying(true);
    setError(null);
    const result = await postJson<CheckoutStarted>("/api/checkout", {
      shopId: cart.shopId,
      items: cart.lines.map((l) => ({ menuItemId: l.menuItemId, quantity: l.quantity, pricePaise: l.pricePaise })),
    });
    if (result.ok) {
      // Leave the app for the hosted checkout (Stripe, or the mock payment page). The cart is cleared only once paid.
      window.location.assign(result.data.checkoutUrl);
      return;
    }
    setPaying(false);
    setError(result.error);
    const ids = result.error.menuItemIds;
    setBlocked(new Set(Array.isArray(ids) ? (ids as string[]) : []));
    if (result.error.code === "PRICE_CHANGED" && Array.isArray(result.error.prices)) {
      cart.updatePrices(result.error.prices as PriceUpdate[]);
    }
  };

  const changeQuantity = (menuItemId: string, quantity: number) => {
    cart.setQuantity(menuItemId, quantity);
    if (quantity <= 0) {
      setBlocked((prev) => {
        const next = new Set(prev);
        next.delete(menuItemId);
        return next;
      });
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_20rem] lg:items-start">
      <section aria-label="Cart items" className="rounded-xl border border-slate-200 bg-white">
        <header className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <p className="min-w-0 truncate text-sm text-slate-600">
            From{" "}
            <Link href={`/shops/${cart.shopId}`} className="font-semibold text-slate-900 underline-offset-2 hover:underline">
              {cart.shopName}
            </Link>
          </p>
          <button
            type="button"
            onClick={() => setConfirmClear(true)}
            className="min-h-10 shrink-0 rounded-lg px-2 text-sm font-medium text-slate-600 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-orange-600"
          >
            Clear cart
          </button>
        </header>
        <ul className="divide-y divide-slate-200">
          {cart.lines.map((line) => {
            const unavailable = blocked.has(line.menuItemId);
            return (
              <li key={line.menuItemId} aria-label={line.name} className="flex gap-3 p-4">
                <Thumb src={line.photoUrl} alt="" size="md" />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-900">{line.name}</p>
                  <p className="text-sm text-slate-500">{formatPaise(line.pricePaise)} each</p>
                  {unavailable && <p className="mt-1 text-sm font-medium text-red-700">Unavailable — please remove it.</p>}
                  <div className="mt-2 flex items-center gap-1">
                    <button
                      type="button"
                      className={stepperClasses}
                      onClick={() => changeQuantity(line.menuItemId, line.quantity - 1)}
                      aria-label={`Decrease ${line.name} quantity`}
                    >
                      <Minus aria-hidden="true" className="size-4" />
                    </button>
                    <span aria-label={`${line.name} quantity`} className="w-8 text-center font-semibold tabular-nums">
                      {line.quantity}
                    </span>
                    <button
                      type="button"
                      className={stepperClasses}
                      onClick={() => changeQuantity(line.menuItemId, line.quantity + 1)}
                      disabled={line.quantity >= MAX_LINE_QUANTITY}
                      aria-label={`Increase ${line.name} quantity`}
                    >
                      <Plus aria-hidden="true" className="size-4" />
                    </button>
                    <button
                      type="button"
                      className={`${stepperClasses} ml-auto text-red-600 hover:bg-red-50`}
                      onClick={() => changeQuantity(line.menuItemId, 0)}
                      aria-label={`Remove ${line.name}`}
                    >
                      <Trash2 aria-hidden="true" className="size-4" />
                    </button>
                  </div>
                </div>
                <p className="shrink-0 font-semibold text-slate-900 tabular-nums">{formatPaise(line.pricePaise * line.quantity)}</p>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-label="Order summary" className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
        {notice && !error && <Alert tone="warning">{notice}</Alert>}
        {error && <Alert tone="error">{error.message}</Alert>}
        <dl className="flex items-center justify-between text-base">
          <dt className="text-slate-600">
            Subtotal ({count} item{count === 1 ? "" : "s"})
          </dt>
          <dd className="font-bold text-slate-900 tabular-nums" data-testid="cart-subtotal">
            {formatPaise(subtotal)}
          </dd>
        </dl>
        <p className="text-xs text-slate-500">No service fee or taxes. Pay online — the shop starts on your order once it&apos;s paid.</p>
        <Button className="w-full" onClick={pay} loading={paying} disabled={blocked.size > 0}>
          Pay {formatPaise(subtotal)}
        </Button>
      </section>

      <Sheet open={confirmClear} onClose={() => setConfirmClear(false)} title="Clear your cart?">
        <p className="text-sm text-slate-700">This removes all {count} item{count === 1 ? "" : "s"} from {cart.shopName}.</p>
        <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={() => setConfirmClear(false)}>
            Keep cart
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              cart.clear();
              setConfirmClear(false);
              setBlocked(new Set());
              setError(null);
            }}
          >
            Clear cart
          </Button>
        </div>
      </Sheet>
    </div>
  );
}
