// MockProvider (SPEC §7): checkout goes to the internal /pay/mock/[orderId] page with "Pay" / "Fail" buttons, and
// refunds succeed instantly. Used by E2E tests and whenever no Stripe key is configured.
import { randomBytes } from "node:crypto";
import type { CheckoutOrder, CheckoutOutcome, CheckoutSession, PaymentProvider, RefundRequest } from "./types";

export const MOCK_SESSION_PREFIX = "mock_cs_";

/** The fake payment id the mock "Pay" button records for an order. */
export const mockPaymentId = (orderId: string) => `mock_pi_${orderId}`;

export class MockProvider implements PaymentProvider {
  readonly name = "mock" as const;

  constructor(private readonly appUrl: string) {}

  async createCheckout(order: CheckoutOrder): Promise<CheckoutSession> {
    return {
      url: new URL(`/pay/mock/${encodeURIComponent(order.id)}`, this.appUrl).toString(),
      sessionId: `${MOCK_SESSION_PREFIX}${order.id}`,
    };
  }

  /** The mock page itself confirms payment; there is nothing external to look up. */
  async retrieveCheckout(): Promise<CheckoutOutcome> {
    return { state: "open" };
  }

  async cancelCheckout(): Promise<void> {}

  async refund(request: RefundRequest): Promise<{ refundId: string }> {
    if (!Number.isInteger(request.amountPaise) || request.amountPaise <= 0) {
      throw new RangeError(`Refund amount must be a positive integer of paise, got ${request.amountPaise}`);
    }
    return { refundId: `mock_re_${randomBytes(6).toString("hex")}` };
  }
}
