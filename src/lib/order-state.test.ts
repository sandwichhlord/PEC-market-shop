import { describe, expect, it } from "vitest";
import {
  allowedTargets,
  canTransition,
  ForbiddenTransitionError,
  InvalidTransitionError,
  OrderTransitionError,
  transition,
  TRANSITIONS,
  type TransitionActor,
} from "./order-state";
import type { OrderStatus } from "@/generated/prisma/enums";

type Case = [from: OrderStatus, to: OrderStatus, actor: TransitionActor, previousStatus?: OrderStatus];

// Every allowed (from, to, actor) combination in SPEC §5 — written out by hand, not derived from TRANSITIONS.
const ALLOWED: Case[] = [
  ["PENDING_PAYMENT", "PLACED_PAID", "SYSTEM"],
  ["PENDING_PAYMENT", "PAYMENT_FAILED", "SYSTEM"],
  ["PAYMENT_FAILED", "PLACED_PAID", "SYSTEM"],
  ["PLACED_PAID", "PREPARING", "SHOP_OWNER"],
  ["PREPARING", "READY_FOR_PICKUP", "SHOP_OWNER"],
  ["READY_FOR_PICKUP", "COMPLETED", "SHOP_OWNER"],
  ["PLACED_PAID", "REFUND_REQUESTED", "CUSTOMER"],
  ["PREPARING", "REFUND_REQUESTED", "CUSTOMER"],
  ["READY_FOR_PICKUP", "REFUND_REQUESTED", "CUSTOMER"],
  ["REFUND_REQUESTED", "REFUNDED", "SHOP_OWNER"],
  ["REFUND_REQUESTED", "REFUNDED", "ADMIN"],
  ["REFUND_REQUESTED", "PLACED_PAID", "SHOP_OWNER", "PLACED_PAID"],
  ["REFUND_REQUESTED", "PREPARING", "SHOP_OWNER", "PREPARING"],
  ["REFUND_REQUESTED", "READY_FOR_PICKUP", "SHOP_OWNER", "READY_FOR_PICKUP"],
  ["REFUND_REQUESTED", "PLACED_PAID", "ADMIN", "PLACED_PAID"],
  ["REFUND_REQUESTED", "PREPARING", "ADMIN", "PREPARING"],
  ["REFUND_REQUESTED", "READY_FOR_PICKUP", "ADMIN", "READY_FOR_PICKUP"],
  ["PLACED_PAID", "COMPLAINT_FILED", "CUSTOMER"],
  ["PREPARING", "COMPLAINT_FILED", "CUSTOMER"],
  ["READY_FOR_PICKUP", "COMPLAINT_FILED", "CUSTOMER"],
  ["COMPLETED", "COMPLAINT_FILED", "CUSTOMER"],
  ["COMPLAINT_FILED", "RESOLVED", "SHOP_OWNER"],
  ["COMPLAINT_FILED", "RESOLVED", "ADMIN"],
  ["COMPLAINT_FILED", "REFUNDED", "ADMIN"],
];

// Transitions not in the table at all → InvalidTransitionError (409).
const NOT_IN_TABLE: Case[] = [
  ["PENDING_PAYMENT", "PREPARING", "SHOP_OWNER"],
  ["PENDING_PAYMENT", "COMPLETED", "SYSTEM"],
  ["PLACED_PAID", "READY_FOR_PICKUP", "SHOP_OWNER"],
  ["PLACED_PAID", "COMPLETED", "SHOP_OWNER"],
  ["PREPARING", "PLACED_PAID", "SHOP_OWNER"],
  ["COMPLETED", "PREPARING", "SHOP_OWNER"],
  ["COMPLETED", "REFUND_REQUESTED", "CUSTOMER"],
  ["PAYMENT_FAILED", "PREPARING", "SHOP_OWNER"],
  ["PAYMENT_FAILED", "REFUND_REQUESTED", "CUSTOMER"],
  ["PENDING_PAYMENT", "REFUND_REQUESTED", "CUSTOMER"],
  ["PENDING_PAYMENT", "COMPLAINT_FILED", "CUSTOMER"],
  ["REFUNDED", "PLACED_PAID", "SYSTEM"],
  ["REFUNDED", "COMPLAINT_FILED", "CUSTOMER"],
  ["RESOLVED", "COMPLAINT_FILED", "CUSTOMER"],
  ["RESOLVED", "REFUNDED", "ADMIN"],
  ["REFUND_REQUESTED", "COMPLETED", "SHOP_OWNER"],
  ["REFUND_REQUESTED", "RESOLVED", "ADMIN"],
  ["COMPLAINT_FILED", "COMPLETED", "SHOP_OWNER"],
  ["PREPARING", "PREPARING", "SHOP_OWNER"],
];

// Transitions that exist but the actor is wrong → ForbiddenTransitionError (403).
const WRONG_ACTOR: Case[] = [
  ["PENDING_PAYMENT", "PLACED_PAID", "CUSTOMER"],
  ["PENDING_PAYMENT", "PLACED_PAID", "SHOP_OWNER"],
  ["PENDING_PAYMENT", "PAYMENT_FAILED", "ADMIN"],
  ["PAYMENT_FAILED", "PLACED_PAID", "CUSTOMER"],
  ["PLACED_PAID", "PREPARING", "CUSTOMER"],
  ["PLACED_PAID", "PREPARING", "ADMIN"],
  ["PREPARING", "READY_FOR_PICKUP", "CUSTOMER"],
  ["READY_FOR_PICKUP", "COMPLETED", "SYSTEM"],
  ["PLACED_PAID", "REFUND_REQUESTED", "SHOP_OWNER"],
  ["REFUND_REQUESTED", "REFUNDED", "CUSTOMER"],
  ["REFUND_REQUESTED", "PREPARING", "CUSTOMER", "PREPARING"],
  ["COMPLETED", "COMPLAINT_FILED", "SHOP_OWNER"],
  ["COMPLAINT_FILED", "RESOLVED", "CUSTOMER"],
  ["COMPLAINT_FILED", "REFUNDED", "SHOP_OWNER"],
  ["COMPLAINT_FILED", "REFUNDED", "CUSTOMER"],
];

describe("order state machine — allowed transitions", () => {
  it.each(ALLOWED)("%s → %s by %s", (from, to, actor, previousStatus) => {
    expect(canTransition(from, to, actor, { previousStatus })).toBe(true);
    expect(transition(from, to, actor, { previousStatus })).toBe(to);
  });

  it("the hand-written list covers every (from, to, actor) in the transition table", () => {
    const fromTable = TRANSITIONS.flatMap((r) => r.actors.map((a) => `${r.from}>${r.to}>${a}`)).sort();
    const fromTests = ALLOWED.map(([f, t, a]) => `${f}>${t}>${a}`).sort();
    expect(fromTests).toEqual(fromTable);
  });
});

describe("order state machine — disallowed transitions", () => {
  it.each(NOT_IN_TABLE)("%s → %s by %s is not a valid transition (409)", (from, to, actor) => {
    expect(canTransition(from, to, actor)).toBe(false);
    expect(() => transition(from, to, actor)).toThrow(InvalidTransitionError);
    try {
      transition(from, to, actor);
    } catch (e) {
      expect(e).toBeInstanceOf(OrderTransitionError);
      expect((e as OrderTransitionError).httpStatus).toBe(409);
    }
  });

  it.each(WRONG_ACTOR)("%s → %s by %s is forbidden for that actor (403)", (from, to, actor, previousStatus) => {
    expect(canTransition(from, to, actor, { previousStatus })).toBe(false);
    expect(() => transition(from, to, actor, { previousStatus })).toThrow(ForbiddenTransitionError);
    try {
      transition(from, to, actor, { previousStatus });
    } catch (e) {
      expect((e as OrderTransitionError).httpStatus).toBe(403);
      expect((e as OrderTransitionError).from).toBe(from);
      expect((e as OrderTransitionError).to).toBe(to);
      expect((e as OrderTransitionError).actor).toBe(actor);
    }
  });

  it("REFUND_REQUESTED can only return to the status it came from", () => {
    expect(canTransition("REFUND_REQUESTED", "READY_FOR_PICKUP", "SHOP_OWNER", { previousStatus: "PREPARING" })).toBe(
      false,
    );
    expect(() =>
      transition("REFUND_REQUESTED", "PLACED_PAID", "SHOP_OWNER", { previousStatus: "PREPARING" }),
    ).toThrow(InvalidTransitionError);
  });

  it("REFUND_REQUESTED cannot resume without knowing the previous status", () => {
    expect(canTransition("REFUND_REQUESTED", "PREPARING", "SHOP_OWNER")).toBe(false);
    expect(canTransition("REFUND_REQUESTED", "PREPARING", "ADMIN", { previousStatus: null })).toBe(false);
  });

  it("terminal statuses have no outgoing transitions for anyone", () => {
    const actors: TransitionActor[] = ["SYSTEM", "CUSTOMER", "SHOP_OWNER", "ADMIN"];
    for (const from of ["REFUNDED", "RESOLVED"] as const) {
      for (const actor of actors) expect(allowedTargets(from, actor)).toEqual([]);
    }
  });
});

describe("allowedTargets", () => {
  it("lists the shop's next step", () => {
    expect(allowedTargets("PLACED_PAID", "SHOP_OWNER")).toEqual(["PREPARING"]);
    expect(allowedTargets("READY_FOR_PICKUP", "SHOP_OWNER")).toEqual(["COMPLETED"]);
  });

  it("lists the customer's dispute options", () => {
    expect(allowedTargets("PREPARING", "CUSTOMER").sort()).toEqual(["COMPLAINT_FILED", "REFUND_REQUESTED"]);
    expect(allowedTargets("COMPLETED", "CUSTOMER")).toEqual(["COMPLAINT_FILED"]);
  });

  it("only offers the previous status when resolving a refund request", () => {
    expect(allowedTargets("REFUND_REQUESTED", "SHOP_OWNER", { previousStatus: "PREPARING" }).sort()).toEqual([
      "PREPARING",
      "REFUNDED",
    ]);
  });
});
