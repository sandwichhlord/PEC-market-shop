"use client";

import { useEffect } from "react";
import { useCartStore } from "@/lib/cart/store";

/** Empties the cart once its order has been paid — but only if the cart still holds that shop's items. */
export function ClearCartOnMount({ shopId }: { shopId: string }) {
  useEffect(() => {
    const clearIfSameShop = () => {
      if (useCartStore.getState().shopId === shopId) useCartStore.getState().clear();
    };
    if (useCartStore.persist.hasHydrated()) {
      clearIfSameShop();
      return;
    }
    const unsubscribe = useCartStore.persist.onFinishHydration(clearIfSameShop);
    void useCartStore.persist.rehydrate();
    return unsubscribe;
  }, [shopId]);
  return null;
}
