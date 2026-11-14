// Payment outcomes → order status (SPEC §3/§7). Every path that learns about a payment (Stripe webhook, success-page
// verification, the mock payment page) ends here, and all of them are idempotent: the first confirmation wins and
// repeats are no-ops.
import type { OrderStatus } from "@/generated/prisma/enums";
import { OrderTransitionError } from "@/lib/order-state";
import { prisma } from "@/server/db";
import { HttpError, notFound } from "@/server/http";
import { mockPaymentId } from "@/server/payments/mock";
import type { PaymentProvider } from "@/server/payments/types";
import { changeStatus } from "./changeStatus";

/** Statuses in which an order is still waiting for money. */
export const UNPAID_STATUSES = ["PENDING_PAYMENT", "PAYMENT_FAILED"] as const satisfies readonly OrderStatus[];
const isUnpaid = (status: OrderStatus) => (UNPAID_STATUSES as readonly OrderStatus[]).includes(status);

export interface PaymentResult {
  /** True if this call changed the order; false if it was already in the target state (or past it). */
  changed: boolean;
  status: OrderStatus;
}

const SYSTEM = { id: null, role: "SYSTEM" } as const;
/** A concurrent writer got there first (another confirmation, a failure, …): re-read and decide again. */
const isRace = (err: unknown) =>
  (err instanceof HttpError && err.code === "ORDER_CHANGED") || err instanceof OrderTransitionError;

async function currentStatus(orderId: string): Promise<{ status: OrderStatus; totalPaise: number }> {
  const order = await prisma.order.findUnique({ where: { id: orderId }, select: { status: true, totalPaise: true } });
  if (!order) throw notFound("Order not found.");
  return order;
}

/**
 * Confirms payment: PENDING_PAYMENT or PAYMENT_FAILED (late success) → PLACED_PAID with paymentStatus PAID, which
 * notifies the shop. Calling it again — or concurrently — for an order that is already paid is a no-op.
 * `amountPaise`, when the provider reports it, must match the order total.
 */
export async function markOrderPaid(
  orderId: string,
  payment: { paymentId: string; amountPaise?: number | null },
): Promise<PaymentResult> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const order = await currentStatus(orderId);
    if (!isUnpaid(order.status)) return { changed: false, status: order.status };
    if (payment.amountPaise != null && payment.amountPaise !== order.totalPaise) {
      throw new HttpError(409, "AMOUNT_MISMATCH", "The paid amount does not match the order total.", {
        expectedPaise: order.totalPaise,
        paidPaise: payment.amountPaise,
      });
    }
    try {
      const changed = await changeStatus({
        orderId,
        to: "PLACED_PAID",
        actor: SYSTEM,
        payment: { paymentStatus: "PAID", stripePaymentId: payment.paymentId },
        onlyFrom: UNPAID_STATUSES,
      });
      return { changed: true, status: changed.status };
    } catch (err) {
      if (!isRace(err)) throw err;
    }
  }
  const order = await currentStatus(orderId);
  return { changed: false, status: order.status };
}

/** Records a cancelled/failed/expired checkout: PENDING_PAYMENT → PAYMENT_FAILED. Anything else is left alone. */
export async function markOrderPaymentFailed(orderId: string, note?: string): Promise<PaymentResult> {
  const order = await currentStatus(orderId);
  if (order.status !== "PENDING_PAYMENT") return { changed: false, status: order.status };
  try {
    const changed = await changeStatus({
      orderId,
      to: "PAYMENT_FAILED",
      actor: SYSTEM,
      note,
      payment: { paymentStatus: "FAILED" },
      onlyFrom: ["PENDING_PAYMENT"],
    });
    return { changed: true, status: changed.status };
  } catch (err) {
    if (!isRace(err)) throw err;
    return { changed: false, status: (await currentStatus(orderId)).status };
  }
}

/** The checkout session of an unpaid order, if it belongs to `provider` (mock sessions are never sent to Stripe). */
async function unpaidSession(orderId: string, provider: PaymentProvider) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { status: true, stripeCheckoutSessionId: true },
  });
  if (!order) throw notFound("Order not found.");
  const sessionId = order.stripeCheckoutSessionId;
  const ours = sessionId !== null && sessionId.startsWith("mock_") === (provider.name === "mock");
  return { status: order.status, sessionId: isUnpaid(order.status) && ours ? sessionId : null };
}

/**
 * Success-page verification (SPEC §7): asks the provider about the order's checkout session so payment is confirmed
 * even when no webhook arrives (local development without the Stripe CLI). Returns the order's status afterwards.
 */
export async function confirmCheckoutPayment(orderId: string, provider: PaymentProvider): Promise<OrderStatus> {
  const { status, sessionId } = await unpaidSession(orderId, provider);
  if (!sessionId) return status;
  const outcome = await provider.retrieveCheckout(sessionId);
  if (outcome.state === "paid") {
    return (await markOrderPaid(orderId, { paymentId: outcome.paymentId, amountPaise: outcome.amountPaise })).status;
  }
  if (outcome.state === "failed") return (await markOrderPaymentFailed(orderId, "Checkout session expired.")).status;
  return status;
}

/**
 * The customer left the hosted checkout without paying: close the session so it can no longer be paid, then mark
 * the order PAYMENT_FAILED (their cart is kept for a retry). If the session turns out to be paid, confirm instead.
 */
export async function cancelCheckout(orderId: string, provider: PaymentProvider): Promise<OrderStatus> {
  const { status, sessionId } = await unpaidSession(orderId, provider);
  if (status !== "PENDING_PAYMENT") return status;
  if (sessionId) {
    const outcome = await provider.retrieveCheckout(sessionId);
    if (outcome.state === "paid") {
      return (await markOrderPaid(orderId, { paymentId: outcome.paymentId, amountPaise: outcome.amountPaise })).status;
    }
    try {
      await provider.cancelCheckout(sessionId);
    } catch (err) {
      // Expiring is only a safeguard: a late payment is still accepted (PAYMENT_FAILED → PLACED_PAID).
      console.warn("[payments] could not expire checkout session", sessionId, err);
    }
  }
  return (await markOrderPaymentFailed(orderId, "Checkout cancelled.")).status;
}

/**
 * The "Pay" / "Fail" buttons of the mock payment page. Only an order that is still waiting for this checkout can be
 * paid or failed; pressing "Pay" again on a paid order is a no-op (like a repeated Stripe confirmation).
 */
export async function applyMockPayment(orderId: string, action: "pay" | "fail"): Promise<PaymentResult> {
  const { status } = await currentStatus(orderId);
  if (action === "pay") {
    if (status === "PAYMENT_FAILED") {
      throw new HttpError(409, "PAYMENT_CLOSED", "This checkout has failed. Go back to your cart to try again.");
    }
    return markOrderPaid(orderId, { paymentId: mockPaymentId(orderId) });
  }
  if (status !== "PENDING_PAYMENT" && status !== "PAYMENT_FAILED") {
    throw new HttpError(409, "ALREADY_PAID", "This order has already been paid.");
  }
  return markOrderPaymentFailed(orderId, "Payment failed (mock).");
}

/**
 * Keeps refund bookkeeping consistent with the provider (Stripe `charge.refunded`): `amountRefundedPaise` is the
 * charge's running refunded total. Refunds issued by the app already raised `refundedPaise`, so their echo is a
 * no-op; a refund made outside the app (e.g. the Stripe dashboard) raises it and sets paymentStatus to
 * PARTIALLY_REFUNDED / REFUNDED. Order status is not changed here — only the dispute flows move it. While a refund
 * request is pending its paymentStatus (REFUND_REQUESTED) is kept; the approval sets the final value.
 */
export async function syncProviderRefund(
  paymentId: string,
  amountRefundedPaise: number,
): Promise<"refund_synced" | "duplicate" | "unknown_order"> {
  const order = await prisma.order.findFirst({
    where: { stripePaymentId: paymentId },
    select: { id: true, status: true, totalPaise: true, refundedPaise: true },
  });
  if (!order) return "unknown_order";
  const refundedPaise = Math.min(amountRefundedPaise, order.totalPaise);
  if (refundedPaise <= order.refundedPaise) return "duplicate";
  const paymentStatus = order.status === "REFUND_REQUESTED" ? undefined : refundedPaise >= order.totalPaise ? "REFUNDED" : "PARTIALLY_REFUNDED";
  const { count } = await prisma.order.updateMany({
    where: { id: order.id, refundedPaise: { lt: refundedPaise } },
    data: { refundedPaise, ...(paymentStatus ? { paymentStatus } : {}) },
  });
  return count > 0 ? "refund_synced" : "duplicate";
}
