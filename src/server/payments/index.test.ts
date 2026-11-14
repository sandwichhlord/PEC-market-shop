import { afterEach, describe, expect, it, vi } from "vitest";
import { PaymentConfigError, getPaymentProvider, getStripeProvider, resolveProviderName } from "./index";
import { MockProvider, mockPaymentId } from "./mock";
import { StripeProvider } from "./stripe";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("resolveProviderName", () => {
  it.each([
    [{ PAYMENTS_PROVIDER: "mock", STRIPE_SECRET_KEY: "sk_test_1" }, "mock"],
    [{ PAYMENTS_PROVIDER: "stripe", STRIPE_SECRET_KEY: "sk_test_1" }, "stripe"],
    [{ PAYMENTS_PROVIDER: "auto", STRIPE_SECRET_KEY: "sk_test_1" }, "stripe"],
    [{ PAYMENTS_PROVIDER: "auto", STRIPE_SECRET_KEY: "" }, "mock"],
    [{ PAYMENTS_PROVIDER: "auto", STRIPE_SECRET_KEY: "   " }, "mock"],
    [{ STRIPE_SECRET_KEY: "sk_test_1" }, "stripe"],
    [{}, "mock"],
    [{ PAYMENTS_PROVIDER: "", STRIPE_SECRET_KEY: "" }, "mock"],
    [{ PAYMENTS_PROVIDER: " Mock " }, "mock"],
  ] as const)("%o → %s", (env, expected) => {
    expect(resolveProviderName(env)).toBe(expected);
  });

  it("refuses stripe without a key and unknown values", () => {
    expect(() => resolveProviderName({ PAYMENTS_PROVIDER: "stripe" })).toThrow(PaymentConfigError);
    expect(() => resolveProviderName({ PAYMENTS_PROVIDER: "paypal" })).toThrow(PaymentConfigError);
  });
});

describe("getPaymentProvider", () => {
  it("returns the mock provider when mocked", () => {
    vi.stubEnv("PAYMENTS_PROVIDER", "mock");
    expect(getPaymentProvider()).toBeInstanceOf(MockProvider);
    expect(() => getStripeProvider()).toThrow(PaymentConfigError);
  });

  it("returns a (cached) Stripe provider when a key is configured", () => {
    vi.stubEnv("PAYMENTS_PROVIDER", "auto");
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_dummy");
    const first = getPaymentProvider();
    expect(first).toBeInstanceOf(StripeProvider);
    expect(getPaymentProvider()).toBe(first);
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_other");
    expect(getPaymentProvider()).not.toBe(first);
  });
});

describe("MockProvider", () => {
  const mock = new MockProvider("http://localhost:3100");

  it("sends checkout to the internal mock payment page", async () => {
    const session = await mock.createCheckout({
      id: "ord_1",
      orderNumber: "PECAAAAAA",
      shopName: "S",
      customerEmail: "a@b.c",
      currency: "inr",
      items: [{ name: "x", unitAmountPaise: 100, quantity: 1 }],
    });
    expect(session).toEqual({ url: "http://localhost:3100/pay/mock/ord_1", sessionId: "mock_cs_ord_1" });
  });

  it("refunds instantly and validates the amount", async () => {
    const { refundId } = await mock.refund({ paymentId: mockPaymentId("ord_1"), amountPaise: 500, idempotencyKey: "k" });
    expect(refundId).toMatch(/^mock_re_[0-9a-f]{12}$/);
    await expect(mock.refund({ paymentId: "p", amountPaise: 0, idempotencyKey: "k" })).rejects.toThrow(RangeError);
  });

  it("has no external session state", async () => {
    await expect(mock.retrieveCheckout()).resolves.toEqual({ state: "open" });
    await expect(mock.cancelCheckout()).resolves.toBeUndefined();
  });
});
