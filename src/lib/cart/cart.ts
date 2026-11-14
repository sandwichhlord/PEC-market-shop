// Pure cart rules (one shop at a time, no out-of-stock or closed-shop adds). The zustand store wraps these so the
// rules are unit-testable without a browser. Checkout (P06) re-validates everything on the server.

export const MAX_LINE_QUANTITY = 20;

export interface CartLine {
  menuItemId: string;
  name: string;
  pricePaise: number;
  photoUrl: string | null;
  quantity: number;
}

export interface CartState {
  shopId: string | null;
  shopName: string | null;
  lines: CartLine[];
}

export const EMPTY_CART: CartState = { shopId: null, shopName: null, lines: [] };

export interface CartShopRef {
  id: string;
  name: string;
  isOpen: boolean;
}

export interface CartDishRef {
  id: string;
  name: string;
  pricePaise: number;
  photoUrl: string | null;
  inStock: boolean;
}

export type AddRejection = "OUT_OF_STOCK" | "SHOP_CLOSED" | "OTHER_SHOP" | "BAD_QUANTITY";
export type AddResult = { ok: true; cart: CartState } | { ok: false; reason: AddRejection };

/**
 * Adds `quantity` of a dish. Refuses out-of-stock dishes, closed shops, and dishes from a different shop than the
 * one already in the cart (the caller asks the user to clear the cart first). Line quantity is capped.
 */
export function addToCart(cart: CartState, shop: CartShopRef, dish: CartDishRef, quantity = 1): AddResult {
  if (!Number.isInteger(quantity) || quantity < 1) return { ok: false, reason: "BAD_QUANTITY" };
  if (!dish.inStock) return { ok: false, reason: "OUT_OF_STOCK" };
  if (!shop.isOpen) return { ok: false, reason: "SHOP_CLOSED" };
  if (cart.shopId !== null && cart.lines.length > 0 && cart.shopId !== shop.id) return { ok: false, reason: "OTHER_SHOP" };

  const existing = cart.lines.find((l) => l.menuItemId === dish.id);
  const lines = existing
    ? cart.lines.map((l) =>
        l.menuItemId === dish.id ? { ...l, quantity: Math.min(MAX_LINE_QUANTITY, l.quantity + quantity) } : l,
      )
    : [
        ...cart.lines,
        {
          menuItemId: dish.id,
          name: dish.name,
          pricePaise: dish.pricePaise,
          photoUrl: dish.photoUrl,
          quantity: Math.min(MAX_LINE_QUANTITY, quantity),
        },
      ];
  return { ok: true, cart: { shopId: shop.id, shopName: shop.name, lines } };
}

/** Sets a line's quantity; 0 or less removes it. An emptied cart forgets its shop. */
export function setLineQuantity(cart: CartState, menuItemId: string, quantity: number): CartState {
  const lines =
    quantity <= 0
      ? cart.lines.filter((l) => l.menuItemId !== menuItemId)
      : cart.lines.map((l) =>
          l.menuItemId === menuItemId ? { ...l, quantity: Math.min(MAX_LINE_QUANTITY, Math.floor(quantity)) } : l,
        );
  return lines.length === 0 ? EMPTY_CART : { ...cart, lines };
}

export const cartItemCount = (cart: CartState) => cart.lines.reduce((n, l) => n + l.quantity, 0);
export const cartSubtotalPaise = (cart: CartState) => cart.lines.reduce((sum, l) => sum + l.pricePaise * l.quantity, 0);
