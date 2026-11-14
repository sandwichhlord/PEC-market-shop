// Stripe webhook handling (SPEC §7): verify the signature, then confirm or fail the order. Every outcome is
// idempotent, so Stripe's retries and the success-page verification can race safely.
import { HttpError } from "@/server/http";
import { findOrderIdForSession } from "@/server/orders/checkout";
import { markOrderPaid, markOrderPaymentFailed, syncProviderRefund } from "@/server/orders/payment";
import { getStripeProvider } from "./index";
import { WebhookSignatureError, type StripeProvider } from "./stripe";

export type WebhookOutcome = "paid" | "failed" | "refund_synced" | "duplicate" | "ignored" | "unknown_order" | "amount_mismatch";

/**
 * Verifies and applies one Stripe event. Throws 400 BAD_SIGNATURE for an unverifiable request. Events the app cannot
 * act on (unknown order, wrong amount) are acknowledged with 200 so Stripe stops retrying, and logged.
 */
export async function handleStripeWebhook(
  rawBody: string,
  signature: string | null,
  provider: StripeProvider = getStripeProvider(),
): Promise<WebhookOutcome> {
  let event;
  try {
    event = provider.parseWebhook(rawBody, signature);
  } catch (err) {
    if (err instanceof WebhookSignatureError) throw new HttpError(400, "BAD_SIGNATURE", "Webhook signature verification failed.");
    throw err;
  }
  if (event.kind === "ignored") return "ignored";
  if (event.kind === "refunded") {
    const outcome = await syncProviderRefund(event.paymentId, event.amountRefundedPaise);
    if (outcome === "unknown_order") console.warn(`[stripe] charge.refunded for unknown payment ${event.paymentId}`);
    return outcome;
  }

  const orderId = await findOrderIdForSession(event.sessionId, event.orderId);
  if (!orderId) {
    console.warn(`[stripe] ${event.eventType} for unknown checkout session ${event.sessionId}`);
    return "unknown_order";
  }

  if (event.kind === "failed") {
    const result = await markOrderPaymentFailed(orderId, `Stripe: ${event.eventType}`);
    return result.changed ? "failed" : "duplicate";
  }

  try {
    const result = await markOrderPaid(orderId, { paymentId: event.paymentId, amountPaise: event.amountPaise });
    return result.changed ? "paid" : "duplicate";
  } catch (err) {
    if (err instanceof HttpError && err.code === "AMOUNT_MISMATCH") {
      console.error(`[stripe] amount mismatch on order ${orderId}`, err.extra);
      return "amount_mismatch";
    }
    throw err;
  }
}
