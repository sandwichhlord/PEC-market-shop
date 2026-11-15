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

  it("also sends dispute changes (into or out of REFUND_REQUESTED / COMPLAINT_FILED) to the admin room", () => {
    const base = { type: "order:status", orderId: "o1", orderNumber: "PEC1", shopId: "s1", customerId: "u1", paymentStatus: "PAID" } as const;
    expect(roomsFor({ ...base, fromStatus: "PREPARING", status: "REFUND_REQUESTED" })).toContain("admin");
    expect(roomsFor({ ...base, fromStatus: "COMPLETED", status: "COMPLAINT_FILED" })).toContain("admin");
    expect(roomsFor({ ...base, fromStatus: "REFUND_REQUESTED", status: "REFUNDED" })).toContain("admin");
    expect(roomsFor({ ...base, fromStatus: "COMPLAINT_FILED", status: "RESOLVED" })).toContain("admin");
    expect(roomsFor({ ...base, fromStatus: "REFUND_REQUESTED", status: "PREPARING" })).toContain("admin");
    for (const [fromStatus, status] of [
      ["PENDING_PAYMENT", "PLACED_PAID"],
      ["PLACED_PAID", "PREPARING"],
      ["READY_FOR_PICKUP", "COMPLETED"],
    ] as const) {
      expect(roomsFor({ ...base, fromStatus, status })).not.toContain("admin");
    }
  });

  it("sends notifications only to their user", () => {
    expect(
      roomsFor({
        type: "notification:new",
        userId: "u9",
        notification: { id: "n1", type: "ORDER_STATUS", title: "t", body: "b", link: null, readAt: null, createdAt: "2026-11-14T00:00:00Z" },
      }),
    ).toEqual(["user:u9"]);
  });

  it("sends menu changes to the public menu room and the shop", () => {
    expect(roomsFor({ type: "menu:item", shopId: "s1", itemId: "d1", inStock: false, archived: false }).sort()).toEqual([
      "menu:s1",
      "shop:s1",
    ]);
  });

  it("sends open/closed and rating changes to the menu room, the shop and the shops list", () => {
    expect(roomsFor({ type: "shop:updated", shopId: "s1", isOpen: false }).sort()).toEqual(["menu:s1", "shop:s1", "shops:all"]);
    expect(
      roomsFor({ type: "shop:review", shopId: "s1", orderId: "o1", reviewId: "r1", average: 4.5, count: 2 }).sort(),
    ).toEqual(["menu:s1", "shop:s1", "shops:all"]);
  });
});
