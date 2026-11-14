"use client";

import { useEffect, useState } from "react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  EMPTY_CART,
  addToCart,
  setLineQuantity,
  type AddResult,
  type CartDishRef,
  type CartShopRef,
  type CartState,
} from "./cart";

interface CartStore extends CartState {
  add: (shop: CartShopRef, dish: CartDishRef, quantity?: number) => AddResult;
  /** Empties the cart and adds the dish — used after the user confirms switching shops. */
  replaceWith: (shop: CartShopRef, dish: CartDishRef, quantity?: number) => AddResult;
  setQuantity: (menuItemId: string, quantity: number) => void;
  clear: () => void;
}

const snapshot = (s: CartState): CartState => ({ shopId: s.shopId, shopName: s.shopName, lines: s.lines });

/**
 * The customer's cart, persisted to localStorage. Hydration is manual (`useCartStore.persist.rehydrate()` in an
 * effect) so server-rendered markup never depends on browser storage.
 */
export const useCartStore = create<CartStore>()(
  persist<CartStore, [], [], CartState>(
    (set, get) => ({
      ...EMPTY_CART,
      add(shop, dish, quantity = 1) {
        const result = addToCart(snapshot(get()), shop, dish, quantity);
        if (result.ok) set(result.cart);
        return result;
      },
      replaceWith(shop, dish, quantity = 1) {
        const result = addToCart(EMPTY_CART, shop, dish, quantity);
        if (result.ok) set(result.cart);
        return result;
      },
      setQuantity(menuItemId, quantity) {
        set(setLineQuantity(snapshot(get()), menuItemId, quantity));
      },
      clear() {
        set(EMPTY_CART);
      },
    }),
    {
      name: "pec-cart",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: snapshot,
      skipHydration: true,
    },
  ),
);

/** Loads the persisted cart once on mount; returns true once it is safe to render cart contents. */
export function useCartHydrated(): boolean {
  const [hydrated, setHydrated] = useState(() => useCartStore.persist.hasHydrated());
  useEffect(() => {
    if (useCartStore.persist.hasHydrated()) return;
    const unsubscribe = useCartStore.persist.onFinishHydration(() => setHydrated(true));
    void useCartStore.persist.rehydrate();
    return unsubscribe;
  }, []);
  return hydrated;
}
