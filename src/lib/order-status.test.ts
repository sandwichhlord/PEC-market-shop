import { describe, expect, it } from "vitest";
import { OrderStatus } from "@/generated/prisma/enums";
import { canTransition } from "./order-state";
import { KITCHEN_TARGETS, SHOP_ORDER_FILTERS, SHOP_VISIBLE_STATUSES, nextKitchenTarget } from "./order-status";
import { roomsFor } from "@/server/realtime/emit";

const ALL = Object.values(OrderStatus);

describe("kitchen actions", () => {
  it("every next kitchen action is a transition the shop may make", () => {
    for (const status of ALL) {
      const target = nextKitchenTarget(status);
      if (target) expect(canTransition(status, target, "SHOP_OWNER")).toBe(true);
    }
  });

  it("offers exactly one action per kitchen status, and none elsewhere", () => {
    expect(ALL.filter((s) => nextKitchenTarget(s) !== null).sort()).toEqual(["PLACED_PAID", "PREPARING", "READY_FOR_PICKUP"]);
    expect(ALL.map(nextKitchenTarget).filter(Boolean).sort()).toEqual([...KITCHEN_TARGETS].sort());
  });
});

describe("shop order filters", () => {
  it("are disjoint and never include unpaid orders", () => {
    const all = Object.values(SHOP_ORDER_FILTERS).flat();
    expect(new Set(all).size).toBe(all.length);
    expect(SHOP_VISIBLE_STATUSES).not.toContain("PENDING_PAYMENT");
    expect(SHOP_VISIBLE_STATUSES).not.toContain("PAYMENT_FAILED");
  });

  it("cover every paid status", () => {
    expect([...SHOP_VISIBLE_STATUSES].sort()).toEqual(ALL.filter((s) => s !== "PENDING_PAYMENT" && s !== "PAYMENT_FAILED").sort());
  });
});

describe("realtime rooms", () => {
  it("sends order status changes to the customer, the order room and the shop", () => {
    expect(
      roomsFor({
        type: "order:status",
        orderId: "o1",
        orderNumber: "PEC1",
        shopId: "s1",
        customerId: "u1",
        fromStatus: "PLACED_PAID",
        status: "PREPARING",
        paymentStatus: "PAID",
      }).sort(),
    ).toEqual(["order:o1", "shop:s1", "user:u1"]);
  });

  it("sends menu changes to the public menu room and the shop", () => {
    expect(roomsFor({ type: "menu:item", shopId: "s1", itemId: "d1", inStock: false, archived: false }).sort()).toEqual([
      "menu:s1",
      "shop:s1",
    ]);
  });
});
