import { describe, expect, it } from "vitest";
import {
  EMPTY_CART,
  MAX_LINE_QUANTITY,
  addToCart,
  cartItemCount,
  cartSubtotalPaise,
  setLineQuantity,
  type CartState,
} from "./cart";

const shopA = { id: "shop-a", name: "Shop A", isOpen: true };
const shopB = { id: "shop-b", name: "Shop B", isOpen: true };
const chai = { id: "chai", name: "Chai", pricePaise: 1500, photoUrl: null, inStock: true };
const samosa = { id: "samosa", name: "Samosa", pricePaise: 2000, photoUrl: "/x.svg", inStock: true };

function mustAdd(cart: CartState, ...args: Parameters<typeof addToCart> extends [CartState, ...infer R] ? R : never) {
  const result = addToCart(cart, ...args);
  if (!result.ok) throw new Error(`expected add to succeed, got ${result.reason}`);
  return result.cart;
}

describe("addToCart", () => {
  it("adds a dish to an empty cart and records the shop", () => {
    const cart = mustAdd(EMPTY_CART, shopA, chai, 2);
    expect(cart.shopId).toBe("shop-a");
    expect(cart.shopName).toBe("Shop A");
    expect(cart.lines).toEqual([{ menuItemId: "chai", name: "Chai", pricePaise: 1500, photoUrl: null, quantity: 2 }]);
  });

  it("merges repeat adds into one line", () => {
    const cart = mustAdd(mustAdd(EMPTY_CART, shopA, chai), shopA, chai, 3);
    expect(cart.lines).toHaveLength(1);
    expect(cart.lines[0]?.quantity).toBe(4);
  });

  it("refuses an out-of-stock dish and leaves the cart untouched", () => {
    const result = addToCart(EMPTY_CART, shopA, { ...chai, inStock: false });
    expect(result).toEqual({ ok: false, reason: "OUT_OF_STOCK" });
  });

  it("refuses dishes from a closed shop", () => {
    expect(addToCart(EMPTY_CART, { ...shopA, isOpen: false }, chai)).toEqual({ ok: false, reason: "SHOP_CLOSED" });
  });

  it("refuses a dish from a second shop while the cart has items", () => {
    const cart = mustAdd(EMPTY_CART, shopA, chai);
    expect(addToCart(cart, shopB, samosa)).toEqual({ ok: false, reason: "OTHER_SHOP" });
  });

  it("rejects non-positive or fractional quantities", () => {
    for (const q of [0, -1, 1.5]) expect(addToCart(EMPTY_CART, shopA, chai, q)).toEqual({ ok: false, reason: "BAD_QUANTITY" });
  });

  it("caps a line at MAX_LINE_QUANTITY", () => {
    const cart = mustAdd(mustAdd(EMPTY_CART, shopA, chai, MAX_LINE_QUANTITY - 1), shopA, chai, 5);
    expect(cart.lines[0]?.quantity).toBe(MAX_LINE_QUANTITY);
  });
});

describe("setLineQuantity", () => {
  it("updates, removes, and forgets the shop when emptied", () => {
    let cart = mustAdd(mustAdd(EMPTY_CART, shopA, chai), shopA, samosa);
    cart = setLineQuantity(cart, "chai", 3);
    expect(cart.lines.find((l) => l.menuItemId === "chai")?.quantity).toBe(3);
    cart = setLineQuantity(cart, "chai", 0);
    expect(cart.lines.map((l) => l.menuItemId)).toEqual(["samosa"]);
    cart = setLineQuantity(cart, "samosa", 0);
    expect(cart).toEqual(EMPTY_CART);
    // Once empty, another shop's dish can be added.
    expect(addToCart(cart, shopB, samosa).ok).toBe(true);
  });
});

describe("totals", () => {
  it("counts items and sums integer paise", () => {
    const cart = mustAdd(mustAdd(EMPTY_CART, shopA, chai, 2), shopA, samosa, 3);
    expect(cartItemCount(cart)).toBe(5);
    expect(cartSubtotalPaise(cart)).toBe(2 * 1500 + 3 * 2000);
  });
});
