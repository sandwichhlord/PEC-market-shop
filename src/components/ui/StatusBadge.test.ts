import { describe, expect, it } from "vitest";
import { OrderStatus } from "@/generated/prisma/enums";
import { STATUS_BADGE_STYLE } from "./StatusBadge";

// SPEC §8 colour per status.
const EXPECTED_HUE: Record<OrderStatus, string> = {
  PENDING_PAYMENT: "gray",
  PLACED_PAID: "blue",
  PREPARING: "amber",
  READY_FOR_PICKUP: "green",
  COMPLETED: "slate",
  PAYMENT_FAILED: "red",
  REFUND_REQUESTED: "orange",
  REFUNDED: "purple",
  COMPLAINT_FILED: "rose",
  RESOLVED: "teal",
};

describe("STATUS_BADGE_STYLE", () => {
  it("covers every order status with its SPEC colour", () => {
    expect(Object.keys(STATUS_BADGE_STYLE).sort()).toEqual(Object.values(OrderStatus).sort());
    for (const status of Object.values(OrderStatus)) {
      const hue = EXPECTED_HUE[status];
      expect(STATUS_BADGE_STYLE[status].badge).toMatch(new RegExp(`\\bbg-${hue}-`));
      expect(STATUS_BADGE_STYLE[status].dot).toBe(`bg-${hue}-500`);
    }
  });

  it("pulses only for READY_FOR_PICKUP", () => {
    const pulsing = Object.entries(STATUS_BADGE_STYLE).filter(([, s]) => s.pulse).map(([k]) => k);
    expect(pulsing).toEqual(["READY_FOR_PICKUP"]);
  });
});
