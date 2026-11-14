import { beforeEach, describe, expect, it, vi } from "vitest";
import { CHECKOUT_SESSION_TTL_SECONDS, StripeProvider, WebhookSignatureError, createStripeProvider, type StripeClient } from "./stripe";
import type { CheckoutOrder } from "./types";

// The Stripe SDK is replaced by a fake: no network, and every call the provider makes is asserted.
const stripeCtor = vi.hoisted(() => vi.fn());
vi.mock("stripe", () => ({
  default: class FakeStripe {
    constructor(key: string) {
      stripeCtor(key);
    }
  },
}));

const NOW = 1_800_000_000;

function fakeStripe() {
  const fake = {
    checkout: {
      sessions: {
        create: vi.fn(async () => ({ id: "cs_test_1", url: "https://checkout.stripe.com/c/pay/cs_test_1" })),
        retrieve: vi.fn(),
        expire: vi.fn(async () => ({ id: "cs_test_1", status: "expired" })),
      },
    },
    refunds: { create: vi.fn(async () => ({ id: "re_123" })) },
    webhooks: { constructEvent: vi.fn() },
  };
  return fake;
}

let fake: ReturnType<typeof fakeStripe>;
let provider: StripeProvider;

const order: CheckoutOrder = {
  id: "order_1",
  orderNumber: "PECABC234",
  shopName: "Chai Point",
  customerEmail: "student@test.pec",
  currency: "inr",
  items: [
    { name: "Masala chai", unitAmountPaise: 1500, quantity: 2 },
    { name: "Samosa", unitAmountPaise: 2000, quantity: 1 },
  ],
};

beforeEach(() => {
  fake = fakeStripe();
  provider = new StripeProvider(fake as unknown as StripeClient, {
    appUrl: "http://localhost:3000",
    webhookSecret: "whsec_test",
    nowSeconds: () => NOW,
  });
});

describe("StripeProvider.createCheckout", () => {
  it("creates a payment-mode Checkout Session with the order's line items, metadata and return URLs", async () => {
    const session = await provider.createCheckout(order);
    expect(session).toEqual({ url: "https://checkout.stripe.com/c/pay/cs_test_1", sessionId: "cs_test_1" });
    expect(fake.checkout.sessions.create).toHaveBeenCalledTimes(1);
    const [params, options] = fake.checkout.sessions.create.mock.calls[0] as unknown as [Record<string, unknown>, unknown];
    expect(params).toMatchObject({
      mode: "payment",
      line_items: [
        { quantity: 2, price_data: { currency: "inr", unit_amount: 1500, product_data: { name: "Masala chai" } } },
        { quantity: 1, price_data: { currency: "inr", unit_amount: 2000, product_data: { name: "Samosa" } } },
      ],
      metadata: { orderId: "order_1", orderNumber: "PECABC234" },
      payment_intent_data: { metadata: { orderId: "order_1" } },
      client_reference_id: "order_1",
      customer_email: "student@test.pec",
      success_url: "http://localhost:3000/checkout/success?orderId=order_1",
      cancel_url: "http://localhost:3000/checkout/cancel?orderId=order_1",
      expires_at: NOW + CHECKOUT_SESSION_TTL_SECONDS,
    });
    expect(options).toEqual({ idempotencyKey: "checkout-order_1" });
  });

  it("fails loudly if Stripe returns no URL", async () => {
    fake.checkout.sessions.create.mockResolvedValueOnce({ id: "cs_x", url: null } as never);
    await expect(provider.createCheckout(order)).rejects.toThrow(/no checkout URL/);
  });

  it("propagates Stripe API errors", async () => {
    fake.checkout.sessions.create.mockRejectedValueOnce(new Error("card_declined"));
    await expect(provider.createCheckout(order)).rejects.toThrow("card_declined");
  });
});

describe("StripeProvider.retrieveCheckout", () => {
  it("reports a paid session with its PaymentIntent id and amount", async () => {
    fake.checkout.sessions.retrieve.mockResolvedValueOnce({
      id: "cs_test_1",
      status: "complete",
      payment_status: "paid",
      payment_intent: "pi_123",
      amount_total: 5000,
    });
    await expect(provider.retrieveCheckout("cs_test_1")).resolves.toEqual({ state: "paid", paymentId: "pi_123", amountPaise: 5000 });
    expect(fake.checkout.sessions.retrieve).toHaveBeenCalledWith("cs_test_1");
  });

  it("accepts an expanded PaymentIntent object", async () => {
    fake.checkout.sessions.retrieve.mockResolvedValueOnce({
      id: "cs_test_1",
      status: "complete",
      payment_status: "paid",
      payment_intent: { id: "pi_obj" },
      amount_total: 5000,
    });
    await expect(provider.retrieveCheckout("cs_test_1")).resolves.toMatchObject({ state: "paid", paymentId: "pi_obj" });
  });

  it("reports an expired session as failed and an open one as open", async () => {
    fake.checkout.sessions.retrieve.mockResolvedValueOnce({ id: "a", status: "expired", payment_status: "unpaid", payment_intent: null });
    await expect(provider.retrieveCheckout("a")).resolves.toEqual({ state: "failed" });
    fake.checkout.sessions.retrieve.mockResolvedValueOnce({ id: "b", status: "open", payment_status: "unpaid", payment_intent: null });
    await expect(provider.retrieveCheckout("b")).resolves.toEqual({ state: "open" });
  });

  it("treats a completed but unsettled (async) payment as still open", async () => {
    fake.checkout.sessions.retrieve.mockResolvedValueOnce({ id: "c", status: "complete", payment_status: "unpaid", payment_intent: "pi_1" });
    await expect(provider.retrieveCheckout("c")).resolves.toEqual({ state: "open" });
  });
});

describe("StripeProvider.cancelCheckout", () => {
  it("expires an open session", async () => {
    fake.checkout.sessions.retrieve.mockResolvedValueOnce({ id: "cs_test_1", status: "open" });
    await provider.cancelCheckout("cs_test_1");
    expect(fake.checkout.sessions.expire).toHaveBeenCalledWith("cs_test_1");
  });

  it("leaves an already closed session alone", async () => {
    fake.checkout.sessions.retrieve.mockResolvedValueOnce({ id: "cs_test_1", status: "expired" });
    await provider.cancelCheckout("cs_test_1");
    expect(fake.checkout.sessions.expire).not.toHaveBeenCalled();
  });
});

describe("StripeProvider.refund", () => {
  it("refunds the PaymentIntent for the given amount with an idempotency key", async () => {
    await expect(provider.refund({ paymentId: "pi_123", amountPaise: 2500, idempotencyKey: "refund-c1" })).resolves.toEqual({
      refundId: "re_123",
    });
    expect(fake.refunds.create).toHaveBeenCalledWith({ payment_intent: "pi_123", amount: 2500 }, { idempotencyKey: "refund-c1" });
  });

  it.each([0, -100, 12.5])("refuses a refund of %s paise without calling Stripe", async (amountPaise) => {
    await expect(provider.refund({ paymentId: "pi_123", amountPaise, idempotencyKey: "k" })).rejects.toThrow(RangeError);
    expect(fake.refunds.create).not.toHaveBeenCalled();
  });
});

describe("StripeProvider.parseWebhook", () => {
  const sessionEvent = (type: string, session: Record<string, unknown>) => ({ id: "evt_1", type, data: { object: session } });
  const paidSession = {
    id: "cs_test_1",
    payment_status: "paid",
    payment_intent: "pi_123",
    amount_total: 5000,
    metadata: { orderId: "order_1" },
  };

  it("verifies the signature with the raw body and the endpoint secret", () => {
    fake.webhooks.constructEvent.mockReturnValueOnce(sessionEvent("checkout.session.completed", paidSession));
    provider.parseWebhook("{raw}", "t=1,v1=abc");
    expect(fake.webhooks.constructEvent).toHaveBeenCalledWith("{raw}", "t=1,v1=abc", "whsec_test");
  });

  it("rejects a bad signature", () => {
    fake.webhooks.constructEvent.mockImplementationOnce(() => {
      throw new Error("No signatures found matching the expected signature for payload");
    });
    expect(() => provider.parseWebhook("{}", "t=1,v1=bad")).toThrow(WebhookSignatureError);
  });

  it("rejects a missing signature header or a missing secret without parsing", () => {
    expect(() => provider.parseWebhook("{}", null)).toThrow(WebhookSignatureError);
    const noSecret = new StripeProvider(fake as unknown as StripeClient, { appUrl: "http://localhost:3000" });
    expect(() => noSecret.parseWebhook("{}", "t=1,v1=abc")).toThrow(WebhookSignatureError);
    expect(fake.webhooks.constructEvent).not.toHaveBeenCalled();
  });

  it("maps checkout.session.completed (paid) and async_payment_succeeded to paid", () => {
    for (const type of ["checkout.session.completed", "checkout.session.async_payment_succeeded"]) {
      fake.webhooks.constructEvent.mockReturnValueOnce(sessionEvent(type, paidSession));
      expect(provider.parseWebhook("{}", "sig")).toEqual({
        kind: "paid",
        eventType: type,
        sessionId: "cs_test_1",
        orderId: "order_1",
        paymentId: "pi_123",
        amountPaise: 5000,
      });
    }
  });

  it("ignores a completed session whose delayed payment has not settled", () => {
    fake.webhooks.constructEvent.mockReturnValueOnce(
      sessionEvent("checkout.session.completed", { ...paidSession, payment_status: "unpaid" }),
    );
    expect(provider.parseWebhook("{}", "sig")).toEqual({ kind: "ignored", eventType: "checkout.session.completed" });
  });

  it("maps checkout.session.expired and async_payment_failed to failed", () => {
    for (const type of ["checkout.session.expired", "checkout.session.async_payment_failed"]) {
      fake.webhooks.constructEvent.mockReturnValueOnce(sessionEvent(type, { id: "cs_test_1", metadata: { orderId: "order_1" } }));
      expect(provider.parseWebhook("{}", "sig")).toEqual({ kind: "failed", eventType: type, sessionId: "cs_test_1", orderId: "order_1" });
    }
  });

  it("ignores other event types", () => {
    fake.webhooks.constructEvent.mockReturnValueOnce({ id: "evt_2", type: "customer.created", data: { object: {} } });
    expect(provider.parseWebhook("{}", "sig")).toEqual({ kind: "ignored", eventType: "customer.created" });
  });
});

describe("createStripeProvider", () => {
  it("builds the SDK client from the secret key", () => {
    const p = createStripeProvider("sk_test_abc", { appUrl: "http://localhost:3000" });
    expect(p).toBeInstanceOf(StripeProvider);
    expect(p.name).toBe("stripe");
    expect(stripeCtor).toHaveBeenCalledWith("sk_test_abc");
  });
});
