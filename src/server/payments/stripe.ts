// StripeProvider (SPEC §7): Checkout Sessions in `payment` mode, signature-verified webhooks, Refunds API.
// The Stripe client is injected so tests can replace the SDK with a fake.
import Stripe from "stripe";
import type { CheckoutOrder, CheckoutOutcome, CheckoutSession, PaymentProvider, RefundRequest } from "./types";

/** Stripe's minimum lifetime for a Checkout Session; abandoned checkouts expire (→ PAYMENT_FAILED) after this. */
export const CHECKOUT_SESSION_TTL_SECONDS = 30 * 60;

/** The subset of the Stripe SDK this provider uses (lets tests pass a small fake). */
export interface StripeClient {
  checkout: { sessions: Pick<Stripe["checkout"]["sessions"], "create" | "retrieve" | "expire"> };
  refunds: Pick<Stripe["refunds"], "create">;
  webhooks: Pick<Stripe["webhooks"], "constructEvent">;
}

export interface StripeProviderOptions {
  appUrl: string;
  /** Signing secret of the webhook endpoint (`stripe listen` prints one). Webhooks are refused without it. */
  webhookSecret?: string;
  /** Overrides the clock (seconds) for session expiry; tests only. */
  nowSeconds?: () => number;
}

/** A verified webhook, reduced to what the order flow needs. */
export type PaymentWebhookEvent =
  | { kind: "paid"; eventType: string; sessionId: string; orderId: string | null; paymentId: string; amountPaise: number | null }
  | { kind: "failed"; eventType: string; sessionId: string; orderId: string | null }
  | { kind: "ignored"; eventType: string };

export class WebhookSignatureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebhookSignatureError";
  }
}

const paymentIntentId = (session: Stripe.Checkout.Session): string | null => {
  const pi = session.payment_intent;
  if (!pi) return null;
  return typeof pi === "string" ? pi : pi.id;
};

const isPaid = (session: Stripe.Checkout.Session) =>
  session.payment_status === "paid" || session.payment_status === "no_payment_required";

export class StripeProvider implements PaymentProvider {
  readonly name = "stripe" as const;

  constructor(
    private readonly stripe: StripeClient,
    private readonly options: StripeProviderOptions,
  ) {}

  async createCheckout(order: CheckoutOrder): Promise<CheckoutSession> {
    const back = (path: string) => {
      const url = new URL(path, this.options.appUrl);
      url.searchParams.set("orderId", order.id);
      return url.toString();
    };
    const now = this.options.nowSeconds?.() ?? Math.floor(Date.now() / 1000);
    const session = await this.stripe.checkout.sessions.create(
      {
        mode: "payment",
        line_items: order.items.map((item) => ({
          quantity: item.quantity,
          price_data: {
            currency: order.currency,
            unit_amount: item.unitAmountPaise,
            product_data: { name: item.name },
          },
        })),
        metadata: { orderId: order.id, orderNumber: order.orderNumber },
        payment_intent_data: {
          metadata: { orderId: order.id, orderNumber: order.orderNumber },
          description: `PEC Market order ${order.orderNumber} — ${order.shopName}`,
        },
        client_reference_id: order.id,
        customer_email: order.customerEmail,
        success_url: back("/checkout/success"),
        cancel_url: back("/checkout/cancel"),
        expires_at: now + CHECKOUT_SESSION_TTL_SECONDS,
      },
      // One Checkout Session per order, even if the request is retried.
      { idempotencyKey: `checkout-${order.id}` },
    );
    if (!session.url) throw new Error(`Stripe returned no checkout URL for session ${session.id}`);
    return { url: session.url, sessionId: session.id };
  }

  async retrieveCheckout(sessionId: string): Promise<CheckoutOutcome> {
    const session = await this.stripe.checkout.sessions.retrieve(sessionId);
    const paymentId = paymentIntentId(session);
    if (isPaid(session) && paymentId) return { state: "paid", paymentId, amountPaise: session.amount_total };
    if (session.status === "expired") return { state: "failed" };
    return { state: "open" };
  }

  async cancelCheckout(sessionId: string): Promise<void> {
    const session = await this.stripe.checkout.sessions.retrieve(sessionId);
    if (session.status === "open") await this.stripe.checkout.sessions.expire(sessionId);
  }

  async refund(request: RefundRequest): Promise<{ refundId: string }> {
    if (!Number.isInteger(request.amountPaise) || request.amountPaise <= 0) {
      throw new RangeError(`Refund amount must be a positive integer of paise, got ${request.amountPaise}`);
    }
    const refund = await this.stripe.refunds.create(
      { payment_intent: request.paymentId, amount: request.amountPaise },
      { idempotencyKey: request.idempotencyKey },
    );
    return { refundId: refund.id };
  }

  /** Verifies the `Stripe-Signature` header against the raw body and maps the event. Throws WebhookSignatureError. */
  parseWebhook(rawBody: string, signature: string | null): PaymentWebhookEvent {
    const secret = this.options.webhookSecret;
    if (!secret) throw new WebhookSignatureError("STRIPE_WEBHOOK_SECRET is not configured.");
    if (!signature) throw new WebhookSignatureError("Missing Stripe-Signature header.");
    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(rawBody, signature, secret);
    } catch (err) {
      throw new WebhookSignatureError(err instanceof Error ? err.message : "Invalid signature.");
    }

    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const session = event.data.object;
        const paymentId = paymentIntentId(session);
        // A completed session whose (delayed) payment has not settled yet waits for async_payment_succeeded/failed.
        if (!isPaid(session) || !paymentId) return { kind: "ignored", eventType: event.type };
        return {
          kind: "paid",
          eventType: event.type,
          sessionId: session.id,
          orderId: session.metadata?.orderId ?? null,
          paymentId,
          amountPaise: session.amount_total,
        };
      }
      case "checkout.session.expired":
      case "checkout.session.async_payment_failed": {
        const session = event.data.object;
        return { kind: "failed", eventType: event.type, sessionId: session.id, orderId: session.metadata?.orderId ?? null };
      }
      default:
        return { kind: "ignored", eventType: event.type };
    }
  }
}

/** A StripeProvider backed by the real SDK. */
export function createStripeProvider(secretKey: string, options: StripeProviderOptions): StripeProvider {
  return new StripeProvider(new Stripe(secretKey), options);
}
