import Stripe from "stripe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OrderStatus } from "@/generated/prisma/enums";
import { POST as postMockPayment } from "@/app/api/payments/mock/[orderId]/route";
import { POST as postWebhook } from "@/app/api/payments/stripe/webhook/route";
import { prisma } from "@/server/db";
import { cancelCheckout, confirmCheckoutPayment, markOrderPaid, markOrderPaymentFailed } from "@/server/orders/payment";
import type { CheckoutOutcome, PaymentProvider } from "@/server/payments/types";
import { apiRequest, createOrderWith, createShopOwner, createUser, sessionCookie, uid } from "../helpers/fixtures";

const WEBHOOK_SECRET = "whsec_vitest_only_secret";
// Only used offline: to sign test payloads exactly as Stripe does.
const signer = new Stripe("sk_test_vitest_dummy");

interface ErrorBody {
  error: { code: string; message: string };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

/** An unpaid order with a checkout session id (mock_… for the mock provider, cs_test_… for Stripe). */
async function unpaidOrder(opts: { status?: OrderStatus; session?: "mock" | "stripe" | "none" } = {}) {
  const { owner, shop } = await createShopOwner();
  const customer = await createUser();
  const order = await createOrderWith({ customerId: customer.id, shopId: shop.id, status: opts.status ?? "PENDING_PAYMENT" });
  const session = opts.session ?? "mock";
  const sessionId = session === "mock" ? `mock_cs_${order.id}` : session === "stripe" ? `cs_test_${uid()}` : null;
  await prisma.order.update({ where: { id: order.id }, data: { stripeCheckoutSessionId: sessionId } });
  return { owner, shop, customer, order: { ...order, stripeCheckoutSessionId: sessionId } };
}

const loadOrder = (id: string) =>
  prisma.order.findUniqueOrThrow({ where: { id }, include: { events: { orderBy: { createdAt: "asc" } } } });
const ownerNotifications = (ownerId: string) => prisma.notification.findMany({ where: { userId: ownerId } });

describe("markOrderPaid", () => {
  it("moves PENDING_PAYMENT → PLACED_PAID, records the payment and notifies the shop", async () => {
    const { owner, order } = await unpaidOrder();
    const result = await markOrderPaid(order.id, { paymentId: "pi_1", amountPaise: order.totalPaise });
    expect(result).toEqual({ changed: true, status: "PLACED_PAID" });
    const after = await loadOrder(order.id);
    expect(after).toMatchObject({ status: "PLACED_PAID", paymentStatus: "PAID", stripePaymentId: "pi_1" });
    expect(after.events.map((e) => [e.fromStatus, e.toStatus, e.actorId])).toEqual([["PENDING_PAYMENT", "PLACED_PAID", null]]);
    const notes = await ownerNotifications(owner.id);
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ type: "NEW_ORDER", link: `/shop/orders/${order.id}` });
  });

  it("is a no-op the second time (no extra event, notification or payment change)", async () => {
    const { owner, customer, order } = await unpaidOrder();
    await markOrderPaid(order.id, { paymentId: "pi_first" });
    const again = await markOrderPaid(order.id, { paymentId: "pi_second" });
    expect(again).toEqual({ changed: false, status: "PLACED_PAID" });
    const after = await loadOrder(order.id);
    expect(after.stripePaymentId).toBe("pi_first");
    expect(after.events).toHaveLength(1);
    expect(await ownerNotifications(owner.id)).toHaveLength(1);
    expect(await prisma.notification.count({ where: { userId: customer.id } })).toBe(1);
  });

  it("is safe when two confirmations race (webhook + success page)", async () => {
    const { owner, order } = await unpaidOrder();
    const results = await Promise.all([
      markOrderPaid(order.id, { paymentId: "pi_race" }),
      markOrderPaid(order.id, { paymentId: "pi_race" }),
      markOrderPaid(order.id, { paymentId: "pi_race" }),
    ]);
    expect(results.filter((r) => r.changed)).toHaveLength(1);
    expect(results.every((r) => r.status === "PLACED_PAID")).toBe(true);
    expect((await loadOrder(order.id)).events).toHaveLength(1);
    expect(await ownerNotifications(owner.id)).toHaveLength(1);
  });

  it("does not move an order the shop is already working on", async () => {
    const { order } = await unpaidOrder({ status: "PREPARING" });
    expect(await markOrderPaid(order.id, { paymentId: "pi_late" })).toEqual({ changed: false, status: "PREPARING" });
  });

  it("accepts a late success after PAYMENT_FAILED", async () => {
    const { order } = await unpaidOrder({ status: "PAYMENT_FAILED" });
    expect(await markOrderPaid(order.id, { paymentId: "pi_late" })).toEqual({ changed: true, status: "PLACED_PAID" });
    expect(await loadOrder(order.id)).toMatchObject({ paymentStatus: "PAID", stripePaymentId: "pi_late" });
  });

  it("refuses an amount that differs from the order total", async () => {
    const { order } = await unpaidOrder();
    await expect(markOrderPaid(order.id, { paymentId: "pi_x", amountPaise: order.totalPaise - 1 })).rejects.toMatchObject({
      code: "AMOUNT_MISMATCH",
    });
    expect((await loadOrder(order.id)).status).toBe("PENDING_PAYMENT");
  });

  it("404s an unknown order", async () => {
    await expect(markOrderPaid("missing-order", { paymentId: "pi" })).rejects.toMatchObject({ status: 404 });
  });
});

describe("markOrderPaymentFailed", () => {
  it("moves PENDING_PAYMENT → PAYMENT_FAILED once and tells the customer, not the shop", async () => {
    const { owner, customer, order } = await unpaidOrder();
    expect(await markOrderPaymentFailed(order.id)).toEqual({ changed: true, status: "PAYMENT_FAILED" });
    expect(await markOrderPaymentFailed(order.id)).toEqual({ changed: false, status: "PAYMENT_FAILED" });
    const after = await loadOrder(order.id);
    expect(after).toMatchObject({ status: "PAYMENT_FAILED", paymentStatus: "FAILED" });
    expect(after.events).toHaveLength(1);
    expect(await ownerNotifications(owner.id)).toHaveLength(0);
    expect(await prisma.notification.count({ where: { userId: customer.id } })).toBe(1);
  });

  it("never un-pays a paid order", async () => {
    const { order } = await unpaidOrder();
    await markOrderPaid(order.id, { paymentId: "pi_1" });
    expect(await markOrderPaymentFailed(order.id)).toEqual({ changed: false, status: "PLACED_PAID" });
  });
});

describe("POST /api/payments/mock/[orderId]", () => {
  const post = (orderId: string, cookie: string | undefined, action: unknown) =>
    postMockPayment(apiRequest(`/api/payments/mock/${orderId}`, { cookie, json: { action } }), {
      params: Promise.resolve({ orderId }),
    });

  beforeEach(() => {
    vi.stubEnv("PAYMENTS_PROVIDER", "mock");
  });

  it("Pay → PLACED_PAID (payment PAID) and redirects to the success page", async () => {
    const { owner, customer, order } = await unpaidOrder();
    const res = await post(order.id, await sessionCookie(customer), "pay");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ changed: true, status: "PLACED_PAID", redirectTo: `/checkout/success?orderId=${order.id}` });
    expect(await loadOrder(order.id)).toMatchObject({
      status: "PLACED_PAID",
      paymentStatus: "PAID",
      stripePaymentId: `mock_pi_${order.id}`,
    });
    expect(await ownerNotifications(owner.id)).toHaveLength(1);
  });

  it("pressing Pay twice is a no-op", async () => {
    const { customer, order } = await unpaidOrder();
    const cookie = await sessionCookie(customer);
    await post(order.id, cookie, "pay");
    const res = await post(order.id, cookie, "pay");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ changed: false, status: "PLACED_PAID" });
    expect((await loadOrder(order.id)).events).toHaveLength(1);
  });

  it("Fail → PAYMENT_FAILED (payment FAILED); a failed checkout can no longer be paid", async () => {
    const { customer, order } = await unpaidOrder();
    const cookie = await sessionCookie(customer);
    const res = await post(order.id, cookie, "fail");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ changed: true, status: "PAYMENT_FAILED", redirectTo: `/checkout/cancel?orderId=${order.id}` });
    expect(await loadOrder(order.id)).toMatchObject({ status: "PAYMENT_FAILED", paymentStatus: "FAILED" });

    const payAfter = await post(order.id, cookie, "pay");
    expect(payAfter.status).toBe(409);
    expect(((await payAfter.json()) as ErrorBody).error.code).toBe("PAYMENT_CLOSED");
  });

  it("cannot fail a paid order", async () => {
    const { customer, order } = await unpaidOrder();
    const cookie = await sessionCookie(customer);
    await post(order.id, cookie, "pay");
    const res = await post(order.id, cookie, "fail");
    expect(res.status).toBe(409);
    expect((await loadOrder(order.id)).status).toBe("PLACED_PAID");
  });

  it("only the order's customer can pay it (others get 404, logged-out 401)", async () => {
    const { owner, order } = await unpaidOrder();
    const stranger = await createUser();
    expect((await post(order.id, await sessionCookie(stranger), "pay")).status).toBe(404);
    expect((await post(order.id, await sessionCookie(owner), "pay")).status).toBe(404);
    expect((await post(order.id, undefined, "pay")).status).toBe(401);
    expect((await loadOrder(order.id)).status).toBe("PENDING_PAYMENT");
  });

  it("does not exist while Stripe is the provider", async () => {
    vi.stubEnv("PAYMENTS_PROVIDER", "stripe");
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_vitest_dummy");
    const { customer, order } = await unpaidOrder();
    expect((await post(order.id, await sessionCookie(customer), "pay")).status).toBe(404);
    expect((await loadOrder(order.id)).status).toBe("PENDING_PAYMENT");
  });

  it("400s an unknown action", async () => {
    const { customer, order } = await unpaidOrder();
    expect((await post(order.id, await sessionCookie(customer), "steal")).status).toBe(400);
  });
});

describe("POST /api/payments/stripe/webhook", () => {
  beforeEach(() => {
    vi.stubEnv("PAYMENTS_PROVIDER", "stripe");
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_vitest_dummy");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", WEBHOOK_SECRET);
  });

  function sessionEvent(type: string, session: Record<string, unknown>) {
    return JSON.stringify({
      id: `evt_${uid()}`,
      object: "event",
      type,
      api_version: "2025-01-01",
      created: Math.floor(Date.now() / 1000),
      data: { object: { object: "checkout.session", ...session } },
    });
  }

  function send(payload: string, signature: string | null = signer.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET })) {
    const headers = new Headers({ "content-type": "application/json" });
    if (signature !== null) headers.set("stripe-signature", signature);
    return postWebhook(new Request("http://localhost:3000/api/payments/stripe/webhook", { method: "POST", headers, body: payload }));
  }

  const paidPayload = (order: { id: string; totalPaise: number; stripeCheckoutSessionId: string | null }, extra = {}) =>
    sessionEvent("checkout.session.completed", {
      id: order.stripeCheckoutSessionId,
      status: "complete",
      payment_status: "paid",
      payment_intent: "pi_webhook_1",
      amount_total: order.totalPaise,
      metadata: { orderId: order.id },
      ...extra,
    });

  it("rejects a bad signature with 400 and changes nothing", async () => {
    const { order } = await unpaidOrder({ session: "stripe" });
    const payload = paidPayload(order);
    const forged = signer.webhooks.generateTestHeaderString({ payload, secret: "whsec_attacker" });
    const res = await send(payload, forged);
    expect(res.status).toBe(400);
    expect(((await res.json()) as ErrorBody).error.code).toBe("BAD_SIGNATURE");
    expect((await loadOrder(order.id)).status).toBe("PENDING_PAYMENT");
  });

  it("rejects a missing signature and a body altered after signing", async () => {
    const { order } = await unpaidOrder({ session: "stripe" });
    const payload = paidPayload(order);
    expect((await send(payload, null)).status).toBe(400);
    const signature = signer.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });
    expect((await send(payload.replace("pi_webhook_1", "pi_evil"), signature)).status).toBe(400);
    expect((await loadOrder(order.id)).status).toBe("PENDING_PAYMENT");
  });

  it("refuses everything when no webhook secret is configured", async () => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "");
    const { order } = await unpaidOrder({ session: "stripe" });
    expect((await send(paidPayload(order))).status).toBe(400);
  });

  it("checkout.session.completed marks the order paid; a replay is a duplicate no-op", async () => {
    const { owner, order } = await unpaidOrder({ session: "stripe" });
    const payload = paidPayload(order);
    const res = await send(payload);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, outcome: "paid" });
    expect(await loadOrder(order.id)).toMatchObject({ status: "PLACED_PAID", paymentStatus: "PAID", stripePaymentId: "pi_webhook_1" });

    const replay = await send(payload);
    expect(await replay.json()).toEqual({ received: true, outcome: "duplicate" });
    expect((await loadOrder(order.id)).events).toHaveLength(1);
    expect(await ownerNotifications(owner.id)).toHaveLength(1);
  });

  it("checkout.session.expired and async_payment_failed mark the order PAYMENT_FAILED", async () => {
    for (const type of ["checkout.session.expired", "checkout.session.async_payment_failed"]) {
      const { order } = await unpaidOrder({ session: "stripe" });
      const res = await send(sessionEvent(type, { id: order.stripeCheckoutSessionId, status: "expired", metadata: { orderId: order.id } }));
      expect(await res.json()).toEqual({ received: true, outcome: "failed" });
      expect(await loadOrder(order.id)).toMatchObject({ status: "PAYMENT_FAILED", paymentStatus: "FAILED" });
    }
  });

  it("an expiry after payment does not undo it", async () => {
    const { order } = await unpaidOrder({ session: "stripe" });
    await send(paidPayload(order));
    const res = await send(sessionEvent("checkout.session.expired", { id: order.stripeCheckoutSessionId, metadata: { orderId: order.id } }));
    expect(await res.json()).toEqual({ received: true, outcome: "duplicate" });
    expect((await loadOrder(order.id)).status).toBe("PLACED_PAID");
  });

  it("a late success after the session failed still places the order", async () => {
    const { order } = await unpaidOrder({ session: "stripe", status: "PAYMENT_FAILED" });
    expect(await (await send(paidPayload(order))).json()).toEqual({ received: true, outcome: "paid" });
    expect((await loadOrder(order.id)).status).toBe("PLACED_PAID");
  });

  it("acknowledges but ignores unpaid completions, wrong amounts, unknown sessions and other events", async () => {
    const { order } = await unpaidOrder({ session: "stripe" });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await (await send(paidPayload(order, { payment_status: "unpaid" }))).json()).toMatchObject({ outcome: "ignored" });
    expect(await (await send(paidPayload(order, { amount_total: 1 }))).json()).toMatchObject({ outcome: "amount_mismatch" });
    expect(await (await send(paidPayload({ ...order, stripeCheckoutSessionId: "cs_test_unknown" }, { metadata: {} }))).json()).toMatchObject({
      outcome: "unknown_order",
    });
    const other = JSON.stringify({ id: "evt_x", object: "event", type: "customer.created", data: { object: { object: "customer" } } });
    expect(await (await send(other)).json()).toMatchObject({ outcome: "ignored" });
    spy.mockRestore();
    warn.mockRestore();
    expect((await loadOrder(order.id)).status).toBe("PENDING_PAYMENT");
  });

  it("does not let metadata point a different session at an order that already has one", async () => {
    const { order } = await unpaidOrder({ session: "stripe" });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const res = await send(paidPayload({ ...order, stripeCheckoutSessionId: "cs_test_other" }));
    warn.mockRestore();
    expect(await res.json()).toMatchObject({ outcome: "unknown_order" });
    expect((await loadOrder(order.id)).status).toBe("PENDING_PAYMENT");
  });

  it("404s while the mock provider is active", async () => {
    vi.stubEnv("PAYMENTS_PROVIDER", "mock");
    const { order } = await unpaidOrder({ session: "stripe" });
    expect((await send(paidPayload(order))).status).toBe(404);
  });
});

describe("success-page verification and cancel", () => {
  function fakeStripeProvider(outcome: CheckoutOutcome) {
    return {
      name: "stripe",
      createCheckout: vi.fn(),
      retrieveCheckout: vi.fn(async () => outcome),
      cancelCheckout: vi.fn(async () => {}),
      refund: vi.fn(),
    } satisfies PaymentProvider;
  }

  it("confirms a paid session without any webhook", async () => {
    const { order } = await unpaidOrder({ session: "stripe" });
    const provider = fakeStripeProvider({ state: "paid", paymentId: "pi_success", amountPaise: order.totalPaise });
    expect(await confirmCheckoutPayment(order.id, provider)).toBe("PLACED_PAID");
    expect(provider.retrieveCheckout).toHaveBeenCalledWith(order.stripeCheckoutSessionId);
    expect(await loadOrder(order.id)).toMatchObject({ paymentStatus: "PAID", stripePaymentId: "pi_success" });
    // Already paid (e.g. the webhook won): no second lookup, no second event.
    expect(await confirmCheckoutPayment(order.id, provider)).toBe("PLACED_PAID");
    expect(provider.retrieveCheckout).toHaveBeenCalledTimes(1);
    expect((await loadOrder(order.id)).events).toHaveLength(1);
  });

  it("leaves an open session pending and fails an expired one", async () => {
    const open = await unpaidOrder({ session: "stripe" });
    expect(await confirmCheckoutPayment(open.order.id, fakeStripeProvider({ state: "open" }))).toBe("PENDING_PAYMENT");
    const expired = await unpaidOrder({ session: "stripe" });
    expect(await confirmCheckoutPayment(expired.order.id, fakeStripeProvider({ state: "failed" }))).toBe("PAYMENT_FAILED");
  });

  it("never sends a mock session to Stripe (or a Stripe session to the mock)", async () => {
    const { order } = await unpaidOrder({ session: "mock" });
    const provider = fakeStripeProvider({ state: "paid", paymentId: "pi", amountPaise: null });
    expect(await confirmCheckoutPayment(order.id, provider)).toBe("PENDING_PAYMENT");
    expect(provider.retrieveCheckout).not.toHaveBeenCalled();
  });

  it("cancel expires the session and marks the order PAYMENT_FAILED", async () => {
    const { order } = await unpaidOrder({ session: "stripe" });
    const provider = fakeStripeProvider({ state: "open" });
    expect(await cancelCheckout(order.id, provider)).toBe("PAYMENT_FAILED");
    expect(provider.cancelCheckout).toHaveBeenCalledWith(order.stripeCheckoutSessionId);
    expect(await loadOrder(order.id)).toMatchObject({ status: "PAYMENT_FAILED", paymentStatus: "FAILED" });
  });

  it("cancel still fails the order if Stripe cannot expire the session", async () => {
    const { order } = await unpaidOrder({ session: "stripe" });
    const provider = fakeStripeProvider({ state: "open" });
    provider.cancelCheckout.mockRejectedValueOnce(new Error("network"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await cancelCheckout(order.id, provider)).toBe("PAYMENT_FAILED");
    warn.mockRestore();
  });

  it("cancel on a session that was actually paid confirms it instead", async () => {
    const { order } = await unpaidOrder({ session: "stripe" });
    const provider = fakeStripeProvider({ state: "paid", paymentId: "pi_paid", amountPaise: order.totalPaise });
    expect(await cancelCheckout(order.id, provider)).toBe("PLACED_PAID");
    expect(provider.cancelCheckout).not.toHaveBeenCalled();
  });

  it("cancel leaves paid orders alone", async () => {
    const { order } = await unpaidOrder({ session: "stripe", status: "PLACED_PAID" });
    const provider = fakeStripeProvider({ state: "open" });
    expect(await cancelCheckout(order.id, provider)).toBe("PLACED_PAID");
    expect(provider.retrieveCheckout).not.toHaveBeenCalled();
  });
});
