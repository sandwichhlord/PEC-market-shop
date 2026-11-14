import { describe, expect, it } from "vitest";
import { SEED_CUSTOMERS, SEED_ORDERS, SEED_REPORTS, SEED_SHOPS } from "../prisma/seed-data";
import { canTransition, type TransitionActor } from "@/lib/order-state";
import type { OrderStatus } from "@/generated/prisma/enums";

const ACTOR: Record<string, TransitionActor> = {
  customer: "CUSTOMER",
  shop: "SHOP_OWNER",
  system: "SYSTEM",
  admin: "ADMIN",
};

describe("seed data (SPEC §10)", () => {
  it("has 4 shops with 6–10 dishes each, positive integer paise prices and prep times", () => {
    expect(SEED_SHOPS).toHaveLength(4);
    for (const shop of SEED_SHOPS) {
      expect(shop.dishes.length).toBeGreaterThanOrEqual(6);
      expect(shop.dishes.length).toBeLessThanOrEqual(10);
      for (const d of shop.dishes) {
        expect(Number.isInteger(d.pricePaise) && d.pricePaise > 0).toBe(true);
        expect(Number.isInteger(d.prepTimeMinutes) && d.prepTimeMinutes > 0).toBe(true);
      }
      expect(new Set(shop.dishes.map((d) => d.key)).size).toBe(shop.dishes.length);
    }
    expect(SEED_SHOPS.map((s) => s.ownerEmail)).toEqual([
      "shop1@pec.test",
      "shop2@pec.test",
      "shop3@pec.test",
      "shop4@pec.test",
    ]);
  });

  it("has the two demo customers", () => {
    expect(SEED_CUSTOMERS.map((c) => c.email)).toEqual(["student1@pec.test", "student2@pec.test"]);
  });

  it("every seeded order references real dishes and follows the state machine", () => {
    const orderNumbers = new Set<string>();
    for (const o of SEED_ORDERS) {
      expect(orderNumbers.has(o.orderNumber)).toBe(false);
      orderNumbers.add(o.orderNumber);
      const shop = SEED_SHOPS.find((s) => s.key === o.shop);
      expect(shop).toBeDefined();
      for (const line of o.items) expect(shop!.dishes.some((d) => d.key === line.dish)).toBe(true);

      let status: OrderStatus = "PENDING_PAYMENT";
      let beforeDispute: OrderStatus | null = null;
      for (const step of o.steps) {
        expect(
          canTransition(status, step.to, ACTOR[step.by]!, { previousStatus: beforeDispute }),
          `${o.orderNumber}: ${status} → ${step.to}`,
        ).toBe(true);
        if (step.to === "REFUND_REQUESTED") beforeDispute = status;
        status = step.to;
      }
      if (o.review) expect(o.steps.some((s) => s.to === "COMPLETED")).toBe(true);
    }
  });

  it("covers a variety of order states and has reviews", () => {
    const finalStatuses = new Set(SEED_ORDERS.map((o) => o.steps.at(-1)!.to));
    expect(finalStatuses.size).toBeGreaterThanOrEqual(5);
    expect(SEED_ORDERS.filter((o) => o.review).length).toBeGreaterThanOrEqual(2);
  });

  it("reports point at seeded orders", () => {
    for (const r of SEED_REPORTS) {
      if (r.orderNumber) expect(SEED_ORDERS.some((o) => o.orderNumber === r.orderNumber)).toBe(true);
    }
  });
});
