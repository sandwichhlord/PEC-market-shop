import { describe, expect, it } from "vitest";
import type { OrderStatus } from "@/generated/prisma/enums";
import { CUSTOMER_ORDER_TABS } from "./order-status";
import { orderPrepMinutes, readyEstimate, trackingSteps, type TrackingEvent } from "./order-tracking";

const t0 = new Date("2026-11-14T10:00:00Z");
const at = (minutes: number) => new Date(t0.getTime() + minutes * 60_000);
const ev = (toStatus: OrderStatus, minutes: number): TrackingEvent => ({ toStatus, createdAt: at(minutes) });

const PAID = [ev("PENDING_PAYMENT", 0), ev("PLACED_PAID", 1)];
const PREPARING = [...PAID, ev("PREPARING", 3)];
const READY = [...PREPARING, ev("READY_FOR_PICKUP", 15)];
const COMPLETED = [...READY, ev("COMPLETED", 20)];

const states = (status: OrderStatus, events: TrackingEvent[]) => trackingSteps(status, events).map((s) => s.state);

describe("trackingSteps", () => {
  it("unpaid orders have reached no step", () => {
    expect(states("PENDING_PAYMENT", [ev("PENDING_PAYMENT", 0)])).toEqual(["upcoming", "upcoming", "upcoming", "upcoming"]);
    expect(states("PAYMENT_FAILED", [ev("PENDING_PAYMENT", 0), ev("PAYMENT_FAILED", 1)])).toEqual([
      "upcoming",
      "upcoming",
      "upcoming",
      "upcoming",
    ]);
  });

  it("marks the order's kitchen status as current and earlier steps done, with their times", () => {
    expect(states("PLACED_PAID", PAID)).toEqual(["current", "upcoming", "upcoming", "upcoming"]);
    expect(states("PREPARING", PREPARING)).toEqual(["done", "current", "upcoming", "upcoming"]);
    const ready = trackingSteps("READY_FOR_PICKUP", READY);
    expect(ready.map((s) => s.state)).toEqual(["done", "done", "current", "upcoming"]);
    expect(ready.map((s) => s.at)).toEqual([at(1), at(3), at(15), null]);
    expect(ready.map((s) => s.label)).toEqual(["Placed & paid", "Preparing", "Ready for pickup", "Completed"]);
  });

  it("a completed order has every step done", () => {
    expect(states("COMPLETED", COMPLETED)).toEqual(["done", "done", "done", "done"]);
  });

  it("disputed or refunded orders keep the steps they reached, none current", () => {
    expect(states("REFUND_REQUESTED", [...PREPARING, ev("REFUND_REQUESTED", 5)])).toEqual(["done", "done", "upcoming", "upcoming"]);
    expect(states("REFUNDED", [...PAID, ev("REFUND_REQUESTED", 2), ev("REFUNDED", 4)])).toEqual(["done", "upcoming", "upcoming", "upcoming"]);
    expect(states("COMPLAINT_FILED", [...COMPLETED, ev("COMPLAINT_FILED", 30)])).toEqual(["done", "done", "done", "done"]);
  });

  it("uses the latest event when a step was reached more than once (refund request rejected, order resumed)", () => {
    const events = [...PREPARING, ev("REFUND_REQUESTED", 5), ev("PREPARING", 8)];
    expect(trackingSteps("PREPARING", events)[1]).toMatchObject({ state: "current", at: at(8) });
  });
});

describe("readyEstimate", () => {
  const items = [{ prepTimeMinutes: 5 }, { prepTimeMinutes: 12 }, { prepTimeMinutes: 8 }];

  it("prep time is the longest dish", () => {
    expect(orderPrepMinutes(items)).toBe(12);
    expect(orderPrepMinutes([])).toBe(0);
  });

  it("before preparation starts: ready about N minutes after the shop starts", () => {
    expect(readyEstimate("PLACED_PAID", PAID, items)).toEqual({ kind: "after-start", prepMinutes: 12 });
  });

  it("while preparing: start of preparation + max prep time", () => {
    expect(readyEstimate("PREPARING", PREPARING, items)).toEqual({ kind: "eta", readyAt: at(3 + 12), prepMinutes: 12 });
  });

  it("counts from the most recent start of preparation", () => {
    const events = [...PREPARING, ev("REFUND_REQUESTED", 5), ev("PREPARING", 8)];
    expect(readyEstimate("PREPARING", events, items)).toMatchObject({ readyAt: at(8 + 12) });
  });

  it("ready for pickup: when it became ready", () => {
    expect(readyEstimate("READY_FOR_PICKUP", READY, items)).toEqual({ kind: "ready", readyAt: at(15) });
  });

  it("no estimate outside the kitchen", () => {
    for (const status of ["PENDING_PAYMENT", "PAYMENT_FAILED", "COMPLETED", "REFUND_REQUESTED", "REFUNDED", "COMPLAINT_FILED", "RESOLVED"] as const) {
      expect(readyEstimate(status, COMPLETED, items)).toBeNull();
    }
  });
});

describe("CUSTOMER_ORDER_TABS", () => {
  it("Active and Past together cover every status exactly once", () => {
    const all: OrderStatus[] = [
      "PENDING_PAYMENT",
      "PAYMENT_FAILED",
      "PLACED_PAID",
      "PREPARING",
      "READY_FOR_PICKUP",
      "COMPLETED",
      "REFUND_REQUESTED",
      "REFUNDED",
      "COMPLAINT_FILED",
      "RESOLVED",
    ];
    const listed = [...CUSTOMER_ORDER_TABS.active, ...CUSTOMER_ORDER_TABS.past];
    expect([...listed].sort()).toEqual([...all].sort());
  });
});
