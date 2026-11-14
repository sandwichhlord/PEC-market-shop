// The payment provider abstraction (CLAUDE.md: StripeProvider + MockProvider, chosen by PAYMENTS_PROVIDER).
// Providers only talk to the payment service; order status changes stay in src/server/orders/payment.ts.

export type PaymentProviderName = "stripe" | "mock";

/** What a provider needs to start a hosted checkout for an order. Amounts are integer paise. */
export interface CheckoutOrder {
  id: string;
  orderNumber: string;
  shopName: string;
  customerEmail: string;
  currency: string;
  items: { name: string; unitAmountPaise: number; quantity: number }[];
}

export interface CheckoutSession {
  /** Where the browser goes to pay. */
  url: string;
  /** The provider's checkout session id (stored on the order as `stripeCheckoutSessionId`). */
  sessionId: string;
}

/** The provider's view of a checkout session (success-page verification). */
export type CheckoutOutcome =
  | { state: "paid"; paymentId: string; amountPaise: number | null }
  | { state: "open" }
  | { state: "failed" };

export interface RefundRequest {
  /** The provider's payment id (Stripe PaymentIntent id) stored on the order. */
  paymentId: string;
  amountPaise: number;
  /** Makes retries of the same refund safe (sent as Stripe's idempotency key). */
  idempotencyKey: string;
}

export interface PaymentProvider {
  readonly name: PaymentProviderName;
  createCheckout(order: CheckoutOrder): Promise<CheckoutSession>;
  /** Looks a checkout session up again, e.g. when the customer lands on the success page. */
  retrieveCheckout(sessionId: string): Promise<CheckoutOutcome>;
  /** Stops a session from being paid (the customer cancelled). Best-effort: an already-closed session is fine. */
  cancelCheckout(sessionId: string): Promise<void>;
  refund(request: RefundRequest): Promise<{ refundId: string }>;
}
