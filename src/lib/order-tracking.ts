// Customer order tracking (SPEC §3 "Live tracking"): the Placed & Paid → Preparing → Ready → Completed progress
// steps and the estimated ready time, both derived from the order's OrderEvent rows. Pure, so pages, API responses
// and tests share one definition.
import type { OrderStatus } from "@/generated/prisma/enums";
import { ORDER_STATUS_LABEL } from "@/lib/order-status";

export const TRACKING_STEPS = ["PLACED_PAID", "PREPARING", "READY_FOR_PICKUP", "COMPLETED"] as const satisfies readonly OrderStatus[];
export type TrackingStatus = (typeof TRACKING_STEPS)[number];

export interface TrackingEvent {
  toStatus: OrderStatus;
  createdAt: Date;
}

export type TrackingStepState = "done" | "current" | "upcoming";

export interface TrackingStep {
  status: TrackingStatus;
  label: string;
  state: TrackingStepState;
  /** When the order (most recently) reached this step, or null if it has not. */
  at: Date | null;
}

const stepIndex = (status: OrderStatus) => (TRACKING_STEPS as readonly OrderStatus[]).indexOf(status);

/** The latest event that moved the order into `status`, if any. */
function lastEventInto(events: readonly TrackingEvent[], status: OrderStatus): TrackingEvent | undefined {
  let latest: TrackingEvent | undefined;
  for (const e of events) {
    if (e.toStatus === status && (!latest || e.createdAt >= latest.createdAt)) latest = e;
  }
  return latest;
}

/**
 * The furthest kitchen step the order has reached. For an order in a kitchen status that is the status itself;
 * for a disputed or refunded order it is the furthest step its events show; unpaid orders have reached none (-1).
 */
function reachedIndex(status: OrderStatus, events: readonly TrackingEvent[]): number {
  const own = stepIndex(status);
  if (own >= 0) return own;
  if (status === "PENDING_PAYMENT" || status === "PAYMENT_FAILED") return -1;
  return events.reduce((max, e) => Math.max(max, stepIndex(e.toStatus)), -1);
}

/**
 * The four progress steps with their state. The order's own kitchen status is "current" (COMPLETED counts as done);
 * while a dispute is open or after a refund nothing is "current" — the steps reached so far stay "done".
 */
export function trackingSteps(status: OrderStatus, events: readonly TrackingEvent[]): TrackingStep[] {
  const reached = reachedIndex(status, events);
  const inKitchen = stepIndex(status) >= 0 && status !== "COMPLETED";
  return TRACKING_STEPS.map((step, i) => ({
    status: step,
    label: ORDER_STATUS_LABEL[step],
    state: i > reached ? "upcoming" : i === reached && inKitchen ? "current" : "done",
    at: i <= reached ? (lastEventInto(events, step)?.createdAt ?? null) : null,
  }));
}

/** Longest prep time among the order's dishes — the kitchen cooks them in parallel (SPEC §3). */
export function orderPrepMinutes(items: readonly { prepTimeMinutes: number }[]): number {
  return items.reduce((max, i) => Math.max(max, i.prepTimeMinutes), 0);
}

export type ReadyEstimate =
  /** Paid, not started: ready about `prepMinutes` after the shop starts preparing. */
  | { kind: "after-start"; prepMinutes: number }
  /** Preparing: expected ready at `readyAt` (start of preparation + prep time). */
  | { kind: "eta"; readyAt: Date; prepMinutes: number }
  /** Ready for pickup since `readyAt`. */
  | { kind: "ready"; readyAt: Date };

/**
 * Estimated ready time (SPEC §3): the max prep time of the items, counted from when Preparing started.
 * Only shown while the order is in the kitchen (PLACED_PAID, PREPARING, READY_FOR_PICKUP); null otherwise.
 */
export function readyEstimate(
  status: OrderStatus,
  events: readonly TrackingEvent[],
  items: readonly { prepTimeMinutes: number }[],
): ReadyEstimate | null {
  const prepMinutes = orderPrepMinutes(items);
  if (status === "PLACED_PAID") return { kind: "after-start", prepMinutes };
  if (status === "PREPARING") {
    const started = lastEventInto(events, "PREPARING");
    if (!started) return { kind: "after-start", prepMinutes };
    return { kind: "eta", readyAt: new Date(started.createdAt.getTime() + prepMinutes * 60_000), prepMinutes };
  }
  if (status === "READY_FOR_PICKUP") {
    const ready = lastEventInto(events, "READY_FOR_PICKUP");
    return ready ? { kind: "ready", readyAt: ready.createdAt } : null;
  }
  return null;
}
