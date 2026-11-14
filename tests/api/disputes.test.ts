import Stripe from "stripe";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import type { OrderStatus } from "@/generated/prisma/enums";
import { POST as postComplaint } from "@/app/api/orders/[orderId]/complaints/route";
import { POST as postRefundRequest } from "@/app/api/orders/[orderId]/refund-request/route";
import { POST as postWebhook } from "@/app/api/payments/stripe/webhook/route";
import { POST as postDispute } from "@/app/api/shops/[shopId]/disputes/[complaintId]/route";
import { prisma } from "@/server/db";
import { MockProvider } from "@/server/payments/mock";
import { apiRequest, createDish, createOrderWith, createShopOwner, createUser, sessionCookie, uid } from "../helpers/fixtures";

interface ErrorBody {
  error?: { code: string; message: string };
}
interface RequestBody extends ErrorBody {
  complaintId: string;
  refundAmountPaise: number;
  order: { status: OrderStatus; paymentStatus: string };
}
interface DisputeBody extends ErrorBody {
  changed: boolean;
  complaint: { id: string; status: string };
  order: { id: string; status: OrderStatus; paymentStatus: string; refundedPaise: number };
}

let refundSpy: MockInstance<MockProvider["refund"]>;

beforeEach(() => {
  vi.stubEnv("PAYMENTS_PROVIDER", "mock");
  refundSpy = vi.spyOn(MockProvider.prototype, "refund");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

/** A shop, a customer and an order of 2× tea (₹20 each) + 1× dosa (₹60) = ₹100, paid, in `status`. */
async function setup(status: OrderStatus = "PREPARING") {
  const { owner, shop } = await createShopOwner();
  const customer = await createUser();
  const [tea, dosa] = await Promise.all([
    createDish(shop.id, { name: "Tea", pricePaise: 2000 }),
    createDish(shop.id, { name: "Dosa", pricePaise: 6000 }),
  ]);
  const order = await createOrderWith({
    customerId: customer.id,
    shopId: shop.id,
    status,
    items: [
      { menuItemId: tea.id, name: "Tea", quantity: 2, pricePaise: 2000 },
      { menuItemId: dosa.id, name: "Dosa", quantity: 1, pricePaise: 6000 },
    ],
  });
  // The kitchen history up to `status`, so a resumed order knows where it was.
  if (status !== "PLACED_PAID") {
    await prisma.orderEvent.create({ data: { orderId: order.id, fromStatus: "PLACED_PAID", toStatus: status, actorId: owner.id } });
  }
  const items = await prisma.orderItem.findMany({ where: { orderId: order.id }, orderBy: { nameAtOrder: "asc" } });
  const [dosaItem, teaItem] = items as [(typeof items)[number], (typeof items)[number]];
  return {
    owner,
    shop,
    customer,
    order,
    dosaItem,
    teaItem,
    customerCookie: await sessionCookie(customer),
    ownerCookie: await sessionCookie(owner),
  };
}

async function requestRefund(orderId: string, cookie: string, body: unknown) {
  const res = await postRefundRequest(apiRequest(`/api/orders/${orderId}/refund-request`, { cookie, json: body }), {
    params: Promise.resolve({ orderId }),
  });
  return { res, body: (await res.json()) as RequestBody };
}

async function fileComplaint(orderId: string, cookie: string, description: string) {
  const res = await postComplaint(apiRequest(`/api/orders/${orderId}/complaints`, { cookie, json: { description } }), {
    params: Promise.resolve({ orderId }),
  });
  return { res, body: (await res.json()) as RequestBody };
}

async function respond(shopId: string, complaintId: string, cookie: string, body: unknown) {
  const res = await postDispute(apiRequest(`/api/shops/${shopId}/disputes/${complaintId}`, { cookie, json: body }), {
    params: Promise.resolve({ shopId, complaintId }),
  });
  return { res, body: (await res.json()) as DisputeBody };
}

const loadOrder = (id: string) =>
  prisma.order.findUniqueOrThrow({
    where: { id },
    include: { items: { orderBy: { nameAtOrder: "asc" } }, events: { orderBy: { createdAt: "asc" } }, complaints: true },
  });
const notesFor = (userId: string) => prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: "asc" } });

describe("refund request (customer)", () => {
  it("whole order: REFUND_REQUESTED, complaint with every item and the full amount, shop notified", async () => {
    const { owner, order, customerCookie, dosaItem, teaItem } = await setup("PREPARING");
    const { res, body } = await requestRefund(order.id, customerCookie, { wholeOrder: true, reason: "Shop is closing early" });
    expect(res.status).toBe(201);
    expect(body).toMatchObject({ refundAmountPaise: 10000, order: { status: "REFUND_REQUESTED", paymentStatus: "REFUND_REQUESTED" } });

    const after = await loadOrder(order.id);
    expect(after.status).toBe("REFUND_REQUESTED");
    expect(after.paymentStatus).toBe("REFUND_REQUESTED");
    expect(after.complaints).toEqual([
      expect.objectContaining({
        id: body.complaintId,
        type: "REFUND",
        status: "OPEN",
        description: "Shop is closing early",
        refundAmountPaise: 10000,
      }),
    ]);
    expect([...after.complaints[0]!.itemIds].sort()).toEqual([dosaItem.id, teaItem.id].sort());
    expect(after.events.at(-1)).toMatchObject({ fromStatus: "PREPARING", toStatus: "REFUND_REQUESTED", note: "Shop is closing early" });
    expect(await notesFor(owner.id)).toEqual([expect.objectContaining({ type: "DISPUTE" })]);
  });

  it("chosen items: the amount is their price at order × quantity", async () => {
    const { order, customerCookie, teaItem } = await setup("PLACED_PAID");
    const { body } = await requestRefund(order.id, customerCookie, { itemIds: [teaItem.id], reason: "No tea today" });
    expect(body.refundAmountPaise).toBe(4000);
  });

  it("only while placed / preparing / ready, and only for unrefunded items of this order", async () => {
    for (const status of ["COMPLETED", "REFUNDED", "COMPLAINT_FILED", "PENDING_PAYMENT", "PAYMENT_FAILED"] as const) {
      const { order, customerCookie } = await setup(status);
      const { res, body } = await requestRefund(order.id, customerCookie, { wholeOrder: true, reason: "Please refund" });
      expect(res.status, status).toBe(409);
      expect(body.error?.code).toBe("REFUND_NOT_AVAILABLE");
    }

    const { order, customerCookie, teaItem } = await setup("READY_FOR_PICKUP");
    await prisma.orderItem.update({ where: { id: teaItem.id }, data: { refunded: true } });
    expect((await requestRefund(order.id, customerCookie, { itemIds: [teaItem.id], reason: "Again please" })).body.error?.code).toBe(
      "ALREADY_REFUNDED",
    );
    const other = await setup("PREPARING");
    expect((await requestRefund(order.id, customerCookie, { itemIds: [other.teaItem.id], reason: "Not mine" })).res.status).toBe(400);
    expect((await loadOrder(order.id)).status).toBe("READY_FOR_PICKUP");
  });

  it("validates the body", async () => {
    const { order, customerCookie, teaItem } = await setup();
    for (const bad of [
      { reason: "No items chosen" },
      { wholeOrder: true, reason: "no" },
      { itemIds: [teaItem.id, teaItem.id], reason: "Duplicate items" },
      { wholeOrder: true },
    ]) {
      const { res, body } = await requestRefund(order.id, customerCookie, bad);
      expect(res.status, JSON.stringify(bad)).toBe(400);
      expect(body.error?.code).toBe("VALIDATION_ERROR");
    }
  });

  it("other customers get 404; shop owners and admins can't request on a customer's behalf", async () => {
    const { owner, order } = await setup();
    const stranger = await createUser();
    expect((await requestRefund(order.id, await sessionCookie(stranger), { wholeOrder: true, reason: "Not my order" })).res.status).toBe(404);
    expect((await requestRefund(order.id, await sessionCookie(owner), { wholeOrder: true, reason: "On their behalf" })).res.status).toBe(403);
    const admin = await createUser({ role: "ADMIN" });
    expect((await requestRefund(order.id, await sessionCookie(admin), { wholeOrder: true, reason: "On their behalf" })).res.status).toBe(403);
    expect((await loadOrder(order.id)).status).toBe("PREPARING");
  });
});

describe("shop approves a refund", () => {
  it("full refund: provider refund for the whole amount, REFUNDED / REFUNDED, every item refunded, customer notified", async () => {
    const { shop, order, customer, customerCookie, ownerCookie } = await setup("PREPARING");
    const { body: requested } = await requestRefund(order.id, customerCookie, { wholeOrder: true, reason: "Shop is closing" });

    const { res, body } = await respond(shop.id, requested.complaintId, ownerCookie, { action: "approve", message: "Sorry about that!" });
    expect(res.status).toBe(200);
    expect(body).toMatchObject({
      changed: true,
      complaint: { status: "RESOLVED" },
      order: { status: "REFUNDED", paymentStatus: "REFUNDED", refundedPaise: 10000 },
    });
    expect(refundSpy).toHaveBeenCalledTimes(1);
    expect(refundSpy).toHaveBeenCalledWith({
      paymentId: order.stripePaymentId,
      amountPaise: 10000,
      idempotencyKey: `refund-${requested.complaintId}`,
    });

    const after = await loadOrder(order.id);
    expect(after.items.every((i) => i.refunded)).toBe(true);
    expect(after.complaints[0]).toMatchObject({ status: "RESOLVED", shopResponse: "Sorry about that!", resolution: "Refunded ₹100." });
    expect(after.events.at(-1)).toMatchObject({ fromStatus: "REFUND_REQUESTED", toStatus: "REFUNDED" });
    expect((await notesFor(customer.id)).at(-1)).toMatchObject({ type: "ORDER_STATUS", body: "Your refund of ₹100 has been issued." });
  });

  it("partial refund: only the chosen items, PARTIALLY_REFUNDED, the order resumes its previous status; the rest can be refunded later", async () => {
    const { shop, order, customer, customerCookie, ownerCookie, teaItem, dosaItem } = await setup("PREPARING");
    const first = await requestRefund(order.id, customerCookie, { itemIds: [teaItem.id], reason: "Tea is finished" });
    const { body } = await respond(shop.id, first.body.complaintId, ownerCookie, { action: "approve" });
    expect(body).toMatchObject({ changed: true, order: { status: "PREPARING", paymentStatus: "PARTIALLY_REFUNDED", refundedPaise: 4000 } });
    expect(refundSpy).toHaveBeenCalledWith(expect.objectContaining({ amountPaise: 4000 }));

    let after = await loadOrder(order.id);
    expect(after.items.map((i) => [i.nameAtOrder, i.refunded])).toEqual([
      ["Dosa", false],
      ["Tea", true],
    ]);
    expect((await notesFor(customer.id)).at(-1)).toMatchObject({
      type: "DISPUTE",
      body: "A partial refund of ₹40 was issued for 2× Tea. Your order continues: Preparing.",
    });

    // "Whole order" now means what is left: the dosa.
    const second = await requestRefund(order.id, customerCookie, { wholeOrder: true, reason: "Changed my mind about the dosa" });
    expect(second.body.refundAmountPaise).toBe(6000);
    const done = await respond(shop.id, second.body.complaintId, ownerCookie, { action: "approve" });
    expect(done.body.order).toMatchObject({ status: "REFUNDED", paymentStatus: "REFUNDED", refundedPaise: 10000 });
    after = await loadOrder(order.id);
    expect(after.items.every((i) => i.refunded)).toBe(true);
    expect(after.complaints.find((c) => c.id === second.body.complaintId)?.itemIds).toEqual([dosaItem.id]);
  });

  it("approving twice is a no-op — also when both clicks race", async () => {
    const { shop, order, customerCookie, ownerCookie } = await setup("PLACED_PAID");
    const a = await requestRefund(order.id, customerCookie, { wholeOrder: true, reason: "Ordered by mistake" });
    const first = await respond(shop.id, a.body.complaintId, ownerCookie, { action: "approve" });
    const again = await respond(shop.id, a.body.complaintId, ownerCookie, { action: "approve" });
    expect(first.body.changed).toBe(true);
    expect(again.res.status).toBe(200);
    expect(again.body).toMatchObject({ changed: false, order: { status: "REFUNDED", refundedPaise: 10000 } });
    expect(refundSpy).toHaveBeenCalledTimes(1);

    const race = await setup("PLACED_PAID");
    const b = await requestRefund(race.order.id, race.customerCookie, { wholeOrder: true, reason: "Ordered by mistake" });
    refundSpy.mockClear();
    const both = await Promise.all([
      respond(race.shop.id, b.body.complaintId, race.ownerCookie, { action: "approve" }),
      respond(race.shop.id, b.body.complaintId, race.ownerCookie, { action: "approve" }),
    ]);
    expect(both.map((r) => r.res.status)).toEqual([200, 200]);
    expect(both.filter((r) => r.body.changed)).toHaveLength(1);
    expect(refundSpy).toHaveBeenCalledTimes(1);
    expect(await loadOrder(race.order.id)).toMatchObject({ status: "REFUNDED", refundedPaise: 10000 });
  });

  it("the refund can never exceed what is still refundable (e.g. after a refund made in the Stripe dashboard)", async () => {
    const { shop, order, customerCookie, ownerCookie } = await setup("PREPARING");
    const { body: requested } = await requestRefund(order.id, customerCookie, { wholeOrder: true, reason: "Please refund all" });
    // ₹30 was already refunded outside the app, so only ₹70 of the ₹100 is left.
    await prisma.order.update({ where: { id: order.id }, data: { refundedPaise: 3000 } });

    const { res, body } = await respond(shop.id, requested.complaintId, ownerCookie, { action: "approve" });
    expect(res.status).toBe(409);
    expect(body.error?.code).toBe("REFUND_EXCEEDS_PAID");
    expect(refundSpy).not.toHaveBeenCalled();
    const after = await loadOrder(order.id);
    expect(after).toMatchObject({ status: "REFUND_REQUESTED", refundedPaise: 3000 });
    expect(after.complaints[0]!.status).toBe("OPEN");
    expect(after.items.some((i) => i.refunded)).toBe(false);
  });

  it("a provider failure leaves everything as it was so the shop can retry", async () => {
    const { shop, order, customerCookie, ownerCookie } = await setup("PREPARING");
    const { body: requested } = await requestRefund(order.id, customerCookie, { wholeOrder: true, reason: "Please refund all" });
    refundSpy.mockRejectedValueOnce(new Error("card_declined"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const failed = await respond(shop.id, requested.complaintId, ownerCookie, { action: "approve" });
    expect(failed.res.status).toBe(502);
    expect(failed.body.error?.code).toBe("REFUND_FAILED");
    let after = await loadOrder(order.id);
    expect(after).toMatchObject({ status: "REFUND_REQUESTED", paymentStatus: "REFUND_REQUESTED", refundedPaise: 0 });
    expect(after.complaints[0]).toMatchObject({ status: "OPEN", shopResponse: null, resolution: null });

    const retried = await respond(shop.id, requested.complaintId, ownerCookie, { action: "approve" });
    expect(retried.body).toMatchObject({ changed: true, order: { status: "REFUNDED" } });
    after = await loadOrder(order.id);
    expect(after.refundedPaise).toBe(10000);
  });
});

describe("shop rejects a refund", () => {
  it("escalates to the admin, the order resumes its previous status and the customer hears why", async () => {
    const { shop, order, customer, customerCookie, ownerCookie } = await setup("READY_FOR_PICKUP");
    const { body: requested } = await requestRefund(order.id, customerCookie, { wholeOrder: true, reason: "Too slow" });

    const { res, body } = await respond(shop.id, requested.complaintId, ownerCookie, { action: "reject", reason: "It is ready at the counter" });
    expect(res.status).toBe(200);
    expect(body).toMatchObject({ changed: true, complaint: { status: "ESCALATED" }, order: { status: "READY_FOR_PICKUP", paymentStatus: "PAID" } });
    expect(refundSpy).not.toHaveBeenCalled();

    const after = await loadOrder(order.id);
    expect(after.complaints[0]).toMatchObject({ status: "ESCALATED", shopResponse: "It is ready at the counter" });
    expect(after.events.at(-1)).toMatchObject({
      fromStatus: "REFUND_REQUESTED",
      toStatus: "READY_FOR_PICKUP",
      note: "Refund request rejected: It is ready at the counter",
    });
    expect((await notesFor(customer.id)).at(-1)).toMatchObject({
      type: "DISPUTE",
      body: "The shop declined your refund request: “It is ready at the counter”. The market admin will review it. Your order continues: Ready for pickup.",
    });

    // Rejecting again is a no-op; approving an escalated request is not the shop's call any more.
    expect((await respond(shop.id, requested.complaintId, ownerCookie, { action: "reject", reason: "Still no" })).body.changed).toBe(false);
    const approve = await respond(shop.id, requested.complaintId, ownerCookie, { action: "approve" });
    expect(approve.res.status).toBe(409);
    expect(approve.body.error?.code).toBe("DISPUTE_CLOSED");
  });

  it("keeps PARTIALLY_REFUNDED when part of the order was refunded before", async () => {
    const { shop, order, customerCookie, ownerCookie, teaItem, dosaItem } = await setup("PREPARING");
    const first = await requestRefund(order.id, customerCookie, { itemIds: [teaItem.id], reason: "No tea" });
    await respond(shop.id, first.body.complaintId, ownerCookie, { action: "approve" });
    const second = await requestRefund(order.id, customerCookie, { itemIds: [dosaItem.id], reason: "Dosa too" });
    const { body } = await respond(shop.id, second.body.complaintId, ownerCookie, { action: "reject", reason: "Dosa is fine" });
    expect(body.order).toMatchObject({ status: "PREPARING", paymentStatus: "PARTIALLY_REFUNDED", refundedPaise: 4000 });
  });

  it("requires a reason", async () => {
    const { shop, order, customerCookie, ownerCookie } = await setup();
    const { body: requested } = await requestRefund(order.id, customerCookie, { wholeOrder: true, reason: "Refund please" });
    const { res } = await respond(shop.id, requested.complaintId, ownerCookie, { action: "reject", reason: "" });
    expect(res.status).toBe(400);
    expect((await loadOrder(order.id)).status).toBe("REFUND_REQUESTED");
  });
});

describe("complaints", () => {
  it("customer files → shop replies → shop resolves (order RESOLVED, customer notified each time)", async () => {
    const { owner, shop, order, customer, customerCookie, ownerCookie } = await setup("COMPLETED");
    const filed = await fileComplaint(order.id, customerCookie, "The dosa was cold and soggy.");
    expect(filed.res.status).toBe(201);
    expect(filed.body.order.status).toBe("COMPLAINT_FILED");
    expect((await notesFor(owner.id)).at(-1)).toMatchObject({ type: "DISPUTE", title: `Complaint filed on ${order.orderNumber}` });

    const reply = await respond(shop.id, filed.body.complaintId, ownerCookie, { action: "reply", message: "Sorry! Come by for a fresh one." });
    expect(reply.body).toMatchObject({ changed: true, complaint: { status: "OPEN" }, order: { status: "COMPLAINT_FILED" } });
    expect((await notesFor(customer.id)).at(-1)).toMatchObject({
      type: "DISPUTE",
      body: "The shop replied to your complaint: “Sorry! Come by for a fresh one.”",
      link: `/orders/${order.id}`,
    });

    const resolved = await respond(shop.id, filed.body.complaintId, ownerCookie, { action: "resolve", resolution: "Replaced the dosa." });
    expect(resolved.body).toMatchObject({ changed: true, complaint: { status: "RESOLVED" }, order: { status: "RESOLVED" } });
    const after = await loadOrder(order.id);
    expect(after.complaints[0]).toMatchObject({
      type: "COMPLAINT",
      status: "RESOLVED",
      shopResponse: "Sorry! Come by for a fresh one.",
      resolution: "Replaced the dosa.",
    });
    expect(after.events.at(-1)).toMatchObject({ fromStatus: "COMPLAINT_FILED", toStatus: "RESOLVED", actorId: owner.id });
    expect((await notesFor(customer.id)).at(-1)).toMatchObject({
      body: "Your complaint has been resolved. Note from the shop: “Replaced the dosa.”",
    });

    // Resolving again is a no-op; replying to a closed complaint is refused.
    expect((await respond(shop.id, filed.body.complaintId, ownerCookie, { action: "resolve" })).body.changed).toBe(false);
    expect((await respond(shop.id, filed.body.complaintId, ownerCookie, { action: "reply", message: "Hello?" })).res.status).toBe(409);
  });

  it("resolve without a note uses the standard message", async () => {
    const { shop, order, customer, customerCookie, ownerCookie } = await setup("PREPARING");
    const filed = await fileComplaint(order.id, customerCookie, "Waiting for 40 minutes now.");
    await respond(shop.id, filed.body.complaintId, ownerCookie, { action: "resolve" });
    expect((await notesFor(customer.id)).at(-1)).toMatchObject({ body: "Your complaint has been resolved." });
  });

  it("only on paid orders up to completion, with a real description", async () => {
    for (const status of ["PENDING_PAYMENT", "PAYMENT_FAILED", "REFUNDED", "RESOLVED", "REFUND_REQUESTED"] as const) {
      const { order, customerCookie } = await setup(status);
      const { res, body } = await fileComplaint(order.id, customerCookie, "Something went wrong here.");
      expect(res.status, status).toBe(409);
      expect(body.error?.code).toBe("COMPLAINT_NOT_AVAILABLE");
    }
    const { order, customerCookie } = await setup("COMPLETED");
    expect((await fileComplaint(order.id, customerCookie, "bad")).res.status).toBe(400);
  });

  it("refund actions don't apply to complaints and vice versa", async () => {
    const { shop, order, customerCookie, ownerCookie } = await setup("COMPLETED");
    const filed = await fileComplaint(order.id, customerCookie, "The dosa was cold and soggy.");
    const approve = await respond(shop.id, filed.body.complaintId, ownerCookie, { action: "approve" });
    expect(approve.res.status).toBe(409);
    expect(approve.body.error?.code).toBe("WRONG_DISPUTE_TYPE");
    expect(refundSpy).not.toHaveBeenCalled();

    const other = await setup("PREPARING");
    const requested = await requestRefund(other.order.id, other.customerCookie, { wholeOrder: true, reason: "Please refund" });
    const reply = await respond(other.shop.id, requested.body.complaintId, other.ownerCookie, { action: "reply", message: "Hi" });
    expect(reply.body.error?.code).toBe("WRONG_DISPUTE_TYPE");
  });
});

describe("shop dispute authorization", () => {
  it("another shop's owner is refused and nothing changes", async () => {
    const { shop, order, customerCookie } = await setup();
    const { body: requested } = await requestRefund(order.id, customerCookie, { wholeOrder: true, reason: "Refund please" });
    const other = await createShopOwner();
    const otherCookie = await sessionCookie(other.owner);

    // Their own shop id + this dispute → not found; this shop's id → not their shop.
    expect((await respond(other.shop.id, requested.complaintId, otherCookie, { action: "approve" })).res.status).toBe(404);
    expect((await respond(shop.id, requested.complaintId, otherCookie, { action: "approve" })).res.status).toBe(403);
    // Customers can't answer disputes either.
    expect((await respond(shop.id, requested.complaintId, customerCookie, { action: "approve" })).res.status).toBe(403);
    expect(refundSpy).not.toHaveBeenCalled();
    expect((await loadOrder(order.id)).complaints[0]!.status).toBe("OPEN");
  });

  it("validates the action", async () => {
    const { shop, order, customerCookie, ownerCookie } = await setup();
    const { body: requested } = await requestRefund(order.id, customerCookie, { wholeOrder: true, reason: "Refund please" });
    for (const bad of [{}, { action: "refund-everything" }, { action: "reply" }]) {
      expect((await respond(shop.id, requested.complaintId, ownerCookie, bad)).res.status).toBe(400);
    }
    expect((await respond(shop.id, "no-such-dispute", ownerCookie, { action: "approve" })).res.status).toBe(404);
  });
});

describe("Stripe charge.refunded webhook", () => {
  const WEBHOOK_SECRET = "whsec_vitest_only_secret";
  const signer = new Stripe("sk_test_vitest_dummy");

  beforeEach(() => {
    vi.stubEnv("PAYMENTS_PROVIDER", "stripe");
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_vitest_dummy");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", WEBHOOK_SECRET);
  });

  async function sendRefunded(paymentIntent: string, amountRefunded: number) {
    const payload = JSON.stringify({
      id: `evt_${uid()}`,
      object: "event",
      type: "charge.refunded",
      api_version: "2025-01-01",
      created: Math.floor(Date.now() / 1000),
      data: { object: { object: "charge", id: `ch_${uid()}`, payment_intent: paymentIntent, amount_refunded: amountRefunded } },
    });
    const headers = new Headers({
      "content-type": "application/json",
      "stripe-signature": signer.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET }),
    });
    const res = await postWebhook(new Request("http://localhost:3000/api/payments/stripe/webhook", { method: "POST", headers, body: payload }));
    return { status: res.status, outcome: ((await res.json()) as { outcome: string }).outcome };
  }

  it("records a refund made outside the app: PARTIALLY_REFUNDED, then REFUNDED; the status itself is untouched", async () => {
    const { order } = await setup("COMPLETED");
    expect(await sendRefunded(order.stripePaymentId!, 4000)).toEqual({ status: 200, outcome: "refund_synced" });
    expect(await loadOrder(order.id)).toMatchObject({ status: "COMPLETED", paymentStatus: "PARTIALLY_REFUNDED", refundedPaise: 4000 });

    expect(await sendRefunded(order.stripePaymentId!, 10000)).toEqual({ status: 200, outcome: "refund_synced" });
    expect(await loadOrder(order.id)).toMatchObject({ status: "COMPLETED", paymentStatus: "REFUNDED", refundedPaise: 10000 });
  });

  it("the echo of a refund the app already recorded (or a replay) is a no-op", async () => {
    const { order } = await setup("PREPARING");
    await prisma.order.update({ where: { id: order.id }, data: { refundedPaise: 4000, paymentStatus: "PARTIALLY_REFUNDED" } });
    expect((await sendRefunded(order.stripePaymentId!, 4000)).outcome).toBe("duplicate");
    expect((await sendRefunded(order.stripePaymentId!, 1000)).outcome).toBe("duplicate");
    expect(await loadOrder(order.id)).toMatchObject({ paymentStatus: "PARTIALLY_REFUNDED", refundedPaise: 4000 });
  });

  it("keeps REFUND_REQUESTED while a request is pending, and never records more than the order total", async () => {
    const { order } = await setup("REFUND_REQUESTED");
    expect((await sendRefunded(order.stripePaymentId!, 99999)).outcome).toBe("refund_synced");
    expect(await loadOrder(order.id)).toMatchObject({ paymentStatus: "REFUND_REQUESTED", refundedPaise: 10000 });
  });

  it("acknowledges refunds for unknown payments", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await sendRefunded(`pi_unknown_${uid()}`, 500)).toEqual({ status: 200, outcome: "unknown_order" });
  });
});
