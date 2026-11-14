"use client";

import { ShoppingBag, UtensilsCrossed } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Sheet } from "@/components/ui/Sheet";
import { cartItemCount, cartSubtotalPaise, type AddResult, type CartShopRef } from "@/lib/cart/cart";
import { useCartHydrated, useCartStore } from "@/lib/cart/store";
import { formatPaise } from "@/lib/money";
import type { MenuDish } from "@/server/shops/list";
import { DishCard } from "./DishCard";
import { DishSheet } from "./DishSheet";

interface PendingSwitch {
  dish: MenuDish;
  quantity: number;
}

const REJECTION_MESSAGE: Record<Exclude<Extract<AddResult, { ok: false }>["reason"], "OTHER_SHOP">, string> = {
  OUT_OF_STOCK: "is out of stock.",
  SHOP_CLOSED: "can't be added while the shop is closed.",
  BAD_QUANTITY: "couldn't be added.",
};

/** The interactive part of a shop page: dish list, detail sheet, add-to-cart and the cart summary bar. */
export function ShopMenu({ shop, dishes }: { shop: CartShopRef; dishes: MenuDish[] }) {
  const hydrated = useCartHydrated();
  const cart = useCartStore();
  // By id, so the open sheet follows live menu updates (stock changes, removed dishes).
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = dishes.find((d) => d.id === selectedId) ?? null;
  const [pendingSwitch, setPendingSwitch] = useState<PendingSwitch | null>(null);
  const [announcement, setAnnouncement] = useState("");

  const handleResult = (result: AddResult, dish: MenuDish, quantity: number) => {
    if (result.ok) {
      setAnnouncement(`Added ${quantity} × ${dish.name} to your cart.`);
      setSelectedId(null);
    } else if (result.reason === "OTHER_SHOP") {
      setSelectedId(null);
      setPendingSwitch({ dish, quantity });
    } else {
      setAnnouncement(`${dish.name} ${REJECTION_MESSAGE[result.reason]}`);
    }
  };

  const add = (dish: MenuDish, quantity: number) => handleResult(cart.add(shop, dish, quantity), dish, quantity);

  const confirmSwitch = () => {
    if (!pendingSwitch) return;
    const { dish, quantity } = pendingSwitch;
    setPendingSwitch(null);
    handleResult(cart.replaceWith(shop, dish, quantity), dish, quantity);
  };

  const quantityInCart = (dishId: string) =>
    hydrated && cart.shopId === shop.id ? (cart.lines.find((l) => l.menuItemId === dishId)?.quantity ?? 0) : 0;
  const count = hydrated ? cartItemCount(cart) : 0;

  return (
    <>
      {dishes.length === 0 ? (
        <EmptyState icon={UtensilsCrossed} title="No dishes yet">
          This shop hasn&apos;t added anything to its menu.
        </EmptyState>
      ) : (
        <ul aria-label="Menu" className="grid gap-3 lg:grid-cols-2">
          {dishes.map((dish) => (
            <li key={dish.id}>
              <DishCard
                dish={dish}
                shopOpen={shop.isOpen}
                inCart={quantityInCart(dish.id)}
                onOpen={() => setSelectedId(dish.id)}
                onQuickAdd={() => add(dish, 1)}
              />
            </li>
          ))}
        </ul>
      )}

      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>

      {count > 0 && (
        <>
          {/* Keeps the last dish clear of the fixed cart bar. */}
          <div aria-hidden="true" className="h-20" />
          <section
            aria-label="Cart summary"
            className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-20 px-4 pb-3 md:bottom-0 md:pb-4"
          >
            <div className="mx-auto flex max-w-5xl items-center gap-2 rounded-xl bg-slate-900 px-3 py-3 sm:gap-3 sm:px-4 text-white shadow-lg">
              <ShoppingBag aria-hidden="true" className="size-5 shrink-0 text-orange-300" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">
                  {count} item{count === 1 ? "" : "s"} · {formatPaise(cartSubtotalPaise(cart))}
                </p>
                <p className="truncate text-xs text-slate-300">from {cart.shopName}</p>
              </div>
              <button
                type="button"
                onClick={cart.clear}
                className="min-h-10 rounded-lg px-3 text-sm font-medium text-slate-200 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-orange-300"
              >
                Clear cart
              </button>
              <Link
                href="/cart"
                className="inline-flex min-h-10 shrink-0 items-center rounded-lg bg-orange-600 px-3 text-sm font-semibold text-white hover:bg-orange-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-300"
              >
                View cart
              </Link>
            </div>
          </section>
        </>
      )}

      <DishSheet dish={selected} shopOpen={shop.isOpen} onClose={() => setSelectedId(null)} onAdd={add} />

      <Sheet open={pendingSwitch !== null} onClose={() => setPendingSwitch(null)} title="Start a new cart?">
        <p className="text-sm text-slate-700">
          Your cart has items from <strong>{cart.shopName}</strong>. You can only order from one shop at a time — clear it
          and add <strong>{pendingSwitch?.dish.name}</strong> from {shop.name}?
        </p>
        <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={() => setPendingSwitch(null)}>
            Keep current cart
          </Button>
          <Button onClick={confirmSwitch}>Clear cart and add</Button>
        </div>
      </Sheet>
    </>
  );
}
