// Order status state machine — the single source of truth for SPEC §5.
// Every status change in the app must be validated here (via src/server/orders/changeStatus.ts).
import type { OrderStatus, Role } from "@/generated/prisma/enums";

/** Who is attempting a transition. SYSTEM = payment confirmations/webhooks, never a logged-in user. */
export type TransitionActor = Role | "SYSTEM";

/** Statuses an order can resume from after a rejected/partial refund request (SPEC §5, "previous status"). */
export const RESUMABLE_STATUSES = ["PLACED_PAID", "PREPARING", "READY_FOR_PICKUP"] as const satisfies readonly OrderStatus[];

/** Paid statuses from which a customer may file a complaint ("PLACED_PAID … COMPLETED"). */
export const COMPLAINABLE_STATUSES = [
  "PLACED_PAID",
  "PREPARING",
  "READY_FOR_PICKUP",
  "COMPLETED",
] as const satisfies readonly OrderStatus[];

interface TransitionRule {
  from: OrderStatus;
  to: OrderStatus;
  actors: readonly TransitionActor[];
  /** The target must equal the status the order had before the refund request. */
  requiresPreviousStatus?: true;
}

const rule = (
  from: OrderStatus,
  to: OrderStatus,
  actors: readonly TransitionActor[],
  requiresPreviousStatus?: true,
): TransitionRule => ({ from, to, actors, requiresPreviousStatus });

/** The full transition table from SPEC §5. Anything not listed is rejected. */
export const TRANSITIONS: readonly TransitionRule[] = [
  rule("PENDING_PAYMENT", "PLACED_PAID", ["SYSTEM"]),
  rule("PENDING_PAYMENT", "PAYMENT_FAILED", ["SYSTEM"]),
  rule("PAYMENT_FAILED", "PLACED_PAID", ["SYSTEM"]),
  rule("PLACED_PAID", "PREPARING", ["SHOP_OWNER"]),
  rule("PREPARING", "READY_FOR_PICKUP", ["SHOP_OWNER"]),
  rule("READY_FOR_PICKUP", "COMPLETED", ["SHOP_OWNER"]),
  ...RESUMABLE_STATUSES.map((from) => rule(from, "REFUND_REQUESTED", ["CUSTOMER"])),
  rule("REFUND_REQUESTED", "REFUNDED", ["SHOP_OWNER", "ADMIN"]),
  // Shop rejects (dispute escalates) or a partial refund is approved → order resumes where it was.
  ...RESUMABLE_STATUSES.map((to) => rule("REFUND_REQUESTED", to, ["SHOP_OWNER", "ADMIN"], true)),
  ...COMPLAINABLE_STATUSES.map((from) => rule(from, "COMPLAINT_FILED", ["CUSTOMER"])),
  rule("COMPLAINT_FILED", "RESOLVED", ["SHOP_OWNER", "ADMIN"]),
  rule("COMPLAINT_FILED", "REFUNDED", ["ADMIN"]),
];

export interface TransitionOptions {
  /** For transitions out of REFUND_REQUESTED back to a working status: the status before the request. */
  previousStatus?: OrderStatus | null;
}

/** Base class for every rejected transition. `httpStatus` is what API routes should respond with. */
export class OrderTransitionError extends Error {
  readonly httpStatus: number = 409;
  constructor(
    message: string,
    readonly from: OrderStatus,
    readonly to: OrderStatus,
    readonly actor: TransitionActor,
  ) {
    super(message);
    this.name = "OrderTransitionError";
  }
}

/** The transition is not in the table at all (or does not return to the previous status). HTTP 409. */
export class InvalidTransitionError extends OrderTransitionError {
  constructor(from: OrderStatus, to: OrderStatus, actor: TransitionActor, detail?: string) {
    super(detail ?? `Order cannot move from ${from} to ${to}.`, from, to, actor);
    this.name = "InvalidTransitionError";
  }
}

/** The transition exists but this actor may not perform it. HTTP 403. */
export class ForbiddenTransitionError extends OrderTransitionError {
  override readonly httpStatus = 403;
  constructor(from: OrderStatus, to: OrderStatus, actor: TransitionActor) {
    super(`${actor} is not allowed to move an order from ${from} to ${to}.`, from, to, actor);
    this.name = "ForbiddenTransitionError";
  }
}

function findRule(from: OrderStatus, to: OrderStatus): TransitionRule | undefined {
  return TRANSITIONS.find((r) => r.from === from && r.to === to);
}

/**
 * Checks a transition without throwing. Returns `{ ok: true }` or the typed error that `transition` would throw.
 */
export function checkTransition(
  from: OrderStatus,
  to: OrderStatus,
  actor: TransitionActor,
  options: TransitionOptions = {},
): { ok: true } | { ok: false; error: OrderTransitionError } {
  const found = findRule(from, to);
  if (!found) return { ok: false, error: new InvalidTransitionError(from, to, actor) };
  if (found.requiresPreviousStatus && options.previousStatus !== to) {
    return {
      ok: false,
      error: new InvalidTransitionError(
        from,
        to,
        actor,
        `Order can only return from ${from} to its previous status (${options.previousStatus ?? "unknown"}), not ${to}.`,
      ),
    };
  }
  if (!found.actors.includes(actor)) return { ok: false, error: new ForbiddenTransitionError(from, to, actor) };
  return { ok: true };
}

/** True if `actor` may move an order from `from` to `to`. */
export function canTransition(
  from: OrderStatus,
  to: OrderStatus,
  actor: TransitionActor,
  options: TransitionOptions = {},
): boolean {
  return checkTransition(from, to, actor, options).ok;
}

/** Validates the transition and returns the new status, or throws an `OrderTransitionError`. */
export function transition(
  from: OrderStatus,
  to: OrderStatus,
  actor: TransitionActor,
  options: TransitionOptions = {},
): OrderStatus {
  const result = checkTransition(from, to, actor, options);
  if (!result.ok) throw result.error;
  return to;
}

/** Every status `actor` may move an order to from `from` (used to decide which action buttons to show). */
export function allowedTargets(
  from: OrderStatus,
  actor: TransitionActor,
  options: TransitionOptions = {},
): OrderStatus[] {
  return TRANSITIONS.filter((r) => r.from === from && canTransition(from, r.to, actor, options)).map((r) => r.to);
}
