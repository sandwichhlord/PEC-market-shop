// P11 admin disputes: force refunds (whole order or chosen items) and resolutions on OPEN and ESCALATED refund
// requests and complaints, through the real customer / shop routes to create realistic disputes.
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { GET as getDisputes } from "@/app/api/admin/disputes/route";
import { GET as getDispute, POST as postAdminDispute } from "@/app/api/admin/disputes/[id]/route";
import { POST as postComplaint } from "@/app/api/orders/[orderId]/complaints/route";
import { POST as postRefundRequest } from "@/app/api/orders/[orderId]/refund-request/route";
import { POST as postShopDispute } from "@/app/api/shops/[shopId]/disputes/[complaintId]/route";
import type { OrderStatus } from "@/generated/prisma/enums";
import { prisma } from "@/server/db";
import { changeStatus } from "@/server/orders/changeStatus";
import { MockProvider } from "@/server/payments/mock";
import { apiRequest, createDish, createOrderWith, createShopOwner, createUser, sessionCookie } from "../helpers/fixtures";

interface ErrorBody {
  error?: { code: string; message: string };
}
interface CreatedBody extends ErrorBody {
  complaintId: string;
}
interface AdminBody extends ErrorBody {
  complaint: { id: string; status: string; resolution: string | null };
  order: { id: string; status: OrderStatus; paymentStatus: string; refundedPaise: number };
}
interface ListedDispute {
  id: string;
  type: string;
  status: string;
  order: { id: string; shop: { id: string } };
}

// Each test drives several routes end to end; give them room on a loaded machine (a timed-out test keeps running
// and would leak provider calls into the next test's spy).
vi.setConfig({ testTimeout: 60_000 });

let refundSpy: MockInstance<MockProvider["refund"]>;

beforeEach(() => {
  vi.stubEnv("PAYMENTS_PROVIDER", "mock");
  refundSpy = vi.spyOn(MockProvider.prototype, "refund");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

/** A shop, a customer, an admin and an order of 2× tea (₹20 each) + 1× dosa (₹60) = ₹100, paid, in `status`. */
async function setup(status: OrderStatus = "PREPARING", existing?: Awaited<ReturnType<typeof createShopOwner>>) {
  const { owner, shop } = existing ?? (await createShopOwner());
  const customer = await createUser();
  const admin = await createUser({ role: "ADMIN" });
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
  if (status !== "PLACED_PAID") {
    await prisma.orderEvent.create({ data: { orderId: order.id, fromStatus: "PLACED_PAID", toStatus: status, actorId: owner.id } });
  }
  const items = await prisma.orderItem.findMany({ where: { orderId: order.id }, orderBy: { nameAtOrder: "asc" } });
  const [dosaItem, teaItem] = items as [(typeof items)[number], (typeof items)[number]];
  return {
    owner,
    shop,
    customer,
    admin,
    order,
    dosaItem,
    teaItem,
    customerCookie: await sessionCookie(customer),
    ownerCookie: await sessionCookie(owner),
    adminCookie: await sessionCookie(admin),
  };
}
type Setup = Awaited<ReturnType<typeof setup>>;

async function requestRefund(s: Setup, body: unknown = { wholeOrder: true, reason: "Please refund this" }) {
  const res = await postRefundRequest(apiRequest(`/api/orders/${s.order.id}/refund-request`, { cookie: s.customerCookie, json: body }), {
    params: Promise.resolve({ orderId: s.order.id }),
  });
  expect(res.status).toBe(201);
  return ((await res.json()) as CreatedBody).complaintId;
}

async function fileComplaint(s: Setup, description = "The dosa was cold and soggy.") {
  const res = await postComplaint(apiRequest(`/api/orders/${s.order.id}/complaints`, { cookie: s.customerCookie, json: { description } }), {
    params: Promise.resolve({ orderId: s.order.id }),
  });
  expect(res.status).toBe(201);
  return ((await res.json()) as CreatedBody).complaintId;
}

async function shopResponds(s: Setup, complaintId: string, body: unknown) {
  const res = await postShopDispute(apiRequest(`/api/shops/${s.shop.id}/disputes/${complaintId}`, { cookie: s.ownerCookie, json: body }), {
    params: Promise.resolve({ shopId: s.shop.id, complaintId }),
  });
  expect(res.status).toBe(200);
}

/** A refund request the shop rejected: ESCALATED, the order resumed its previous status. */
async function escalated(s: Setup, body?: unknown) {
  const id = await requestRefund(s, body);
  await shopResponds(s, id, { action: "reject", reason: "The food is fine" });
  return id;
}

async function admin(s: Setup, id: string, body: unknown, cookie = s.adminCookie) {
  const res = await postAdminDispute(apiRequest(`/api/admin/disputes/${id}`, { cookie, json: body }), {
    params: Promise.resolve({ id }),
  });
  return { res, body: (await res.json()) as AdminBody };
}

const loadOrder = (id: string) =>
  prisma.order.findUniqueOrThrow({
    where: { id },
    include: { items: { orderBy: { nameAtOrder: "asc" } }, events: { orderBy: { createdAt: "asc" } }, complaints: true },
  });
const complaint = (id: string) => prisma.complaint.findUniqueOrThrow({ where: { id } });
const notesOf = (userId: string) => prisma.notification.findMany({ where: { userId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
/** How many notifications the customer and the shop owner have now. */
async function noteCounts(s: Setup) {
  return { customer: (await notesOf(s.customer.id)).length, owner: (await notesOf(s.owner.id)).length };
}
/** Notifications created after the user had `count` of them. */
const notesSince = async (userId: string, count: number) => (await notesOf(userId)).slice(count);

describe("force refund of an OPEN refund request", () => {
  it("whole order: provider refunds everything, REFUNDED, items refunded, RESOLVED with the note, both sides told", async () => {
    const s = await setup("PREPARING");
    const id = await requestRefund(s);
    const since = await noteCounts(s);

    const { res, body } = await admin(s, id, { action: "refund", wholeOrder: true, note: "Shop did not answer" });
    expect(res.status).toBe(200);
    expect(body).toMatchObject({
      complaint: { id, status: "RESOLVED" },
      order: { status: "REFUNDED", paymentStatus: "REFUNDED", refundedPaise: 10000 },
    });
    expect(body.complaint.resolution).toContain("Shop did not answer");
    expect(refundSpy).toHaveBeenCalledTimes(1);
    expect(refundSpy).toHaveBeenCalledWith({ paymentId: s.order.stripePaymentId, amountPaise: 10000, idempotencyKey: `admin-refund-${id}` });

    const after = await loadOrder(s.order.id);
    expect(after.items.every((i) => i.refunded)).toBe(true);
    expect(after.events.at(-1)).toMatchObject({ fromStatus: "REFUND_REQUESTED", toStatus: "REFUNDED", actorId: s.admin.id });
    expect((await complaint(id)).resolution).toContain("Shop did not answer");
    expect((await notesSince(s.customer.id, since.customer)).at(-1)?.body).toContain("Shop did not answer");
    expect(await notesSince(s.owner.id, since.owner)).toEqual([expect.objectContaining({ type: "DISPUTE" })]);
  });

  it("chosen items: the order resumes its previous status, PARTIALLY_REFUNDED", async () => {
    const s = await setup("PREPARING");
    const id = await requestRefund(s);
    const since = await noteCounts(s);
    const { res, body } = await admin(s, id, { action: "refund", itemIds: [s.teaItem.id], note: "Only the tea was missing" });
    expect(res.status).toBe(200);
    expect(body).toMatchObject({
      complaint: { status: "RESOLVED" },
      order: { status: "PREPARING", paymentStatus: "PARTIALLY_REFUNDED", refundedPaise: 4000 },
    });
    expect(refundSpy).toHaveBeenCalledWith(expect.objectContaining({ amountPaise: 4000 }));
    const after = await loadOrder(s.order.id);
    expect(after.items.map((i) => [i.nameAtOrder, i.refunded])).toEqual([
      ["Dosa", false],
      ["Tea", true],
    ]);
    expect(after.events.at(-1)).toMatchObject({ fromStatus: "REFUND_REQUESTED", toStatus: "PREPARING", actorId: s.admin.id });
    expect((await notesSince(s.customer.id, since.customer)).length).toBeGreaterThan(0);
    expect((await notesSince(s.owner.id, since.owner)).length).toBeGreaterThan(0);
  });
});

describe("force refund of an ESCALATED refund request", () => {
  it("whole order: the resumed order goes straight to REFUNDED", async () => {
    const s = await setup("PREPARING");
    const id = await escalated(s);
    expect((await loadOrder(s.order.id)).status).toBe("PREPARING");

    const { res, body } = await admin(s, id, { action: "refund", wholeOrder: true, note: "Customer was right" });
    expect(res.status).toBe(200);
    expect(body).toMatchObject({
      complaint: { status: "RESOLVED" },
      order: { status: "REFUNDED", paymentStatus: "REFUNDED", refundedPaise: 10000 },
    });
    expect(refundSpy).toHaveBeenCalledWith({ paymentId: s.order.stripePaymentId, amountPaise: 10000, idempotencyKey: `admin-refund-${id}` });
    const after = await loadOrder(s.order.id);
    expect(after.items.every((i) => i.refunded)).toBe(true);
    expect(after.events.at(-1)).toMatchObject({ fromStatus: "PREPARING", toStatus: "REFUNDED", actorId: s.admin.id });
  });

  it("chosen items: the order's status is unchanged, PARTIALLY_REFUNDED, both sides told", async () => {
    const s = await setup("READY_FOR_PICKUP");
    const id = await escalated(s);
    const eventsBefore = (await loadOrder(s.order.id)).events.length;
    const since = await noteCounts(s);

    const { res, body } = await admin(s, id, { action: "refund", itemIds: [s.dosaItem.id], note: "Dosa was burnt" });
    expect(res.status).toBe(200);
    expect(body).toMatchObject({
      complaint: { status: "RESOLVED" },
      order: { status: "READY_FOR_PICKUP", paymentStatus: "PARTIALLY_REFUNDED", refundedPaise: 6000 },
    });
    const after = await loadOrder(s.order.id);
    expect(after.items.map((i) => [i.nameAtOrder, i.refunded])).toEqual([
      ["Dosa", true],
      ["Tea", false],
    ]);
    expect(after.events).toHaveLength(eventsBefore);
    expect(await notesSince(s.customer.id, since.customer)).toEqual([expect.objectContaining({ type: "DISPUTE" })]);
    expect(await notesSince(s.owner.id, since.owner)).toEqual([expect.objectContaining({ type: "DISPUTE" })]);
  });

  it("an escalated dispute waits while the order has another open dispute (409 ORDER_IN_DISPUTE)", async () => {
    const s = await setup("PREPARING");
    const id = await escalated(s);
    await fileComplaint(s);
    for (const action of [
      { action: "refund", wholeOrder: true, note: "Refund it" },
      { action: "resolve", note: "Closing it" },
    ]) {
      const { res, body } = await admin(s, id, action);
      expect(res.status, action.action).toBe(409);
      expect(body.error?.code).toBe("ORDER_IN_DISPUTE");
    }
    expect(refundSpy).not.toHaveBeenCalled();
    expect((await complaint(id)).status).toBe("ESCALATED");
    expect((await loadOrder(s.order.id)).status).toBe("COMPLAINT_FILED");
  });
});

describe("OPEN complaints", () => {
  it("whole-order refund → REFUNDED", async () => {
    const s = await setup("COMPLETED");
    const id = await fileComplaint(s);
    const { res, body } = await admin(s, id, { action: "refund", wholeOrder: true, note: "Full refund for the trouble" });
    expect(res.status).toBe(200);
    expect(body).toMatchObject({ complaint: { status: "RESOLVED" }, order: { status: "REFUNDED", paymentStatus: "REFUNDED", refundedPaise: 10000 } });
    expect((await loadOrder(s.order.id)).events.at(-1)).toMatchObject({ fromStatus: "COMPLAINT_FILED", toStatus: "REFUNDED", actorId: s.admin.id });
  });

  it("partial refund → order RESOLVED, PARTIALLY_REFUNDED", async () => {
    const s = await setup("COMPLETED");
    const id = await fileComplaint(s);
    const { body } = await admin(s, id, { action: "refund", itemIds: [s.dosaItem.id], note: "Refunding the dosa" });
    expect(body).toMatchObject({
      complaint: { status: "RESOLVED" },
      order: { status: "RESOLVED", paymentStatus: "PARTIALLY_REFUNDED", refundedPaise: 6000 },
    });
  });

  it("resolve with a note → order RESOLVED, complaint RESOLVED with the note, no refund", async () => {
    const s = await setup("COMPLETED");
    const id = await fileComplaint(s);
    const since = await noteCounts(s);
    const { res, body } = await admin(s, id, { action: "resolve", note: "Spoke to both sides" });
    expect(res.status).toBe(200);
    expect(body).toMatchObject({ complaint: { status: "RESOLVED", resolution: "Spoke to both sides" }, order: { status: "RESOLVED", paymentStatus: "PAID" } });
    expect(refundSpy).not.toHaveBeenCalled();
    expect((await complaint(id)).resolution).toBe("Spoke to both sides");
    expect((await notesSince(s.customer.id, since.customer)).at(-1)?.body).toContain("Spoke to both sides");
    expect((await notesSince(s.owner.id, since.owner)).at(-1)?.body).toContain("Spoke to both sides");
  });
});

describe("resolve without refund", () => {
  it("OPEN refund request → REJECTED, order resumes its previous status, payment PAID", async () => {
    const s = await setup("READY_FOR_PICKUP");
    const id = await requestRefund(s);
    const { res, body } = await admin(s, id, { action: "resolve", note: "Order is ready, please collect" });
    expect(res.status).toBe(200);
    expect(body).toMatchObject({
      complaint: { status: "REJECTED", resolution: "Order is ready, please collect" },
      order: { status: "READY_FOR_PICKUP", paymentStatus: "PAID", refundedPaise: 0 },
    });
    expect(refundSpy).not.toHaveBeenCalled();
    expect((await loadOrder(s.order.id)).events.at(-1)).toMatchObject({ fromStatus: "REFUND_REQUESTED", toStatus: "READY_FOR_PICKUP", actorId: s.admin.id });
  });

  it("ESCALATED refund request → REJECTED, order unchanged; acting again is 409 DISPUTE_CLOSED", async () => {
    const s = await setup("PREPARING");
    const id = await escalated(s);
    const since = await noteCounts(s);
    const { res, body } = await admin(s, id, { action: "resolve", note: "Agree with the shop" });
    expect(res.status).toBe(200);
    expect(body).toMatchObject({ complaint: { status: "REJECTED", resolution: "Agree with the shop" }, order: { status: "PREPARING", paymentStatus: "PAID" } });
    expect((await notesSince(s.customer.id, since.customer)).length).toBe(1);
    expect((await notesSince(s.owner.id, since.owner)).length).toBe(1);

    const again = await admin(s, id, { action: "refund", wholeOrder: true, note: "Changed my mind" });
    expect(again.res.status).toBe(409);
    expect(again.body.error?.code).toBe("DISPUTE_CLOSED");
    expect(refundSpy).not.toHaveBeenCalled();
  });
});

describe("refunding exactly once, never more than what's left", () => {
  it("a second force refund is 409 DISPUTE_CLOSED and the provider is called once", async () => {
    const s = await setup("PREPARING");
    const id = await requestRefund(s);
    expect((await admin(s, id, { action: "refund", itemIds: [s.teaItem.id], note: "Tea refund" })).res.status).toBe(200);
    const again = await admin(s, id, { action: "refund", itemIds: [s.dosaItem.id], note: "Dosa too" });
    expect(again.res.status).toBe(409);
    expect(again.body.error?.code).toBe("DISPUTE_CLOSED");
    expect(refundSpy).toHaveBeenCalledTimes(1);
    expect((await loadOrder(s.order.id)).refundedPaise).toBe(4000);
  });

  it("two concurrent force refunds: exactly one succeeds and one provider call", async () => {
    const s = await setup("PREPARING");
    const id = await escalated(s);
    const both = await Promise.all([
      admin(s, id, { action: "refund", wholeOrder: true, note: "Refund all" }),
      admin(s, id, { action: "refund", wholeOrder: true, note: "Refund all" }),
    ]);
    expect(both.map((r) => r.res.status).sort()).toEqual([200, 409]);
    // The loser sees the dispute closed, or (if it read the order after the winner marked the items) nothing left.
    expect(["DISPUTE_CLOSED", "NOTHING_TO_REFUND"]).toContain(both.find((r) => r.res.status === 409)?.body.error?.code);
    expect(refundSpy).toHaveBeenCalledTimes(1);
    expect(await loadOrder(s.order.id)).toMatchObject({ status: "REFUNDED", refundedPaise: 10000 });
  });

  it("items refunded since are 409 ALREADY_REFUNDED; foreign items 400; whole order means what is left", async () => {
    const s = await setup("PREPARING");
    const id = await escalated(s);
    // The customer asks again for the tea only and the shop approves that one.
    const teaRequest = await requestRefund(s, { itemIds: [s.teaItem.id], reason: "No tea after all" });
    await shopResponds(s, teaRequest, { action: "approve" });
    expect(await loadOrder(s.order.id)).toMatchObject({ status: "PREPARING", refundedPaise: 4000 });
    refundSpy.mockClear();

    const already = await admin(s, id, { action: "refund", itemIds: [s.teaItem.id, s.dosaItem.id], note: "Refund both" });
    expect(already.res.status).toBe(409);
    expect(already.body.error?.code).toBe("ALREADY_REFUNDED");

    const other = await setup("PREPARING");
    const foreign = await admin(s, id, { action: "refund", itemIds: [other.teaItem.id], note: "Wrong order" });
    expect(foreign.res.status).toBe(400);
    expect(refundSpy).not.toHaveBeenCalled();
    expect((await complaint(id)).status).toBe("ESCALATED");

    const rest = await admin(s, id, { action: "refund", wholeOrder: true, note: "The rest" });
    expect(rest.body.order).toMatchObject({ status: "REFUNDED", paymentStatus: "REFUNDED", refundedPaise: 10000 });
    expect(refundSpy).toHaveBeenCalledWith(expect.objectContaining({ amountPaise: 6000 }));
  });

  it("a refund the provider issued is recorded on the order even if the kitchen moved the order meanwhile", async () => {
    const s = await setup("PREPARING");
    const id = await escalated(s);
    // While the provider call is in flight the shop marks the order ready (escalated orders stay in the kitchen flow).
    refundSpy.mockImplementationOnce(async () => {
      await changeStatus({ orderId: s.order.id, to: "READY_FOR_PICKUP", actor: { id: s.owner.id, role: "SHOP_OWNER" } });
      return { refundId: "mock_re_race" };
    });

    await admin(s, id, { action: "refund", itemIds: [s.dosaItem.id], note: "Dosa was burnt" });
    expect(refundSpy).toHaveBeenCalledTimes(1);
    // Money went back to the customer, so the order must say so (and the dispute is closed).
    const after = await loadOrder(s.order.id);
    expect(after).toMatchObject({ status: "READY_FOR_PICKUP", paymentStatus: "PARTIALLY_REFUNDED", refundedPaise: 6000 });
    expect(after.items.find((i) => i.id === s.dosaItem.id)?.refunded).toBe(true);
    expect((await complaint(id)).status).toBe("RESOLVED");
  });

  it("validates the body", async () => {
    const s = await setup("PREPARING");
    const id = await requestRefund(s);
    for (const bad of [
      { action: "refund", note: "No items chosen" },
      { action: "refund", wholeOrder: true },
      { action: "refund", itemIds: [s.teaItem.id, s.teaItem.id], note: "Twice" },
      { action: "resolve", note: "no" },
      { action: "approve" },
    ]) {
      const { res, body } = await admin(s, id, bad);
      expect(res.status, JSON.stringify(bad)).toBe(400);
      expect(body.error?.code).toBe("VALIDATION_ERROR");
    }
    expect((await admin(s, "no-such-dispute", { action: "resolve", note: "Closing it" })).res.status).toBe(404);
    expect(refundSpy).not.toHaveBeenCalled();
  });

  it("a provider failure is 502 REFUND_FAILED and the dispute is back as it was, so a retry works", async () => {
    for (const kind of ["open", "escalated"] as const) {
      const s = await setup("PREPARING");
      const id = kind === "open" ? await requestRefund(s) : await escalated(s);
      const before = await complaint(id);
      refundSpy.mockRejectedValueOnce(new Error("card_declined"));
      vi.spyOn(console, "error").mockImplementation(() => {});

      const failed = await admin(s, id, { action: "refund", wholeOrder: true, note: "Refund all" });
      expect(failed.res.status, kind).toBe(502);
      expect(failed.body.error?.code).toBe("REFUND_FAILED");
      expect(await complaint(id)).toMatchObject({ status: before.status, resolution: before.resolution });
      expect(await loadOrder(s.order.id)).toMatchObject({ refundedPaise: 0, status: kind === "open" ? "REFUND_REQUESTED" : "PREPARING" });

      const retried = await admin(s, id, { action: "refund", wholeOrder: true, note: "Refund all" });
      expect(retried.res.status, kind).toBe(200);
      expect(retried.body.order).toMatchObject({ status: "REFUNDED", refundedPaise: 10000 });
    }
  });
});

describe("disputes queue and detail", () => {
  async function list(cookie: string, query: string) {
    const res = await getDisputes(apiRequest(`/api/admin/disputes${query}`, { cookie }));
    expect(res.status).toBe(200);
    return ((await res.json()) as { disputes: ListedDispute[] }).disputes;
  }

  it("filters by status (active = OPEN + ESCALATED, escalated first), shop and type", async () => {
    const a = await setup("PREPARING");
    const shopRef = { owner: a.owner, shop: a.shop };
    const openRefund = await requestRefund(a);
    const b = await setup("PREPARING", shopRef);
    const escalatedRefund = await escalated(b);
    const c = await setup("COMPLETED", shopRef);
    const openComplaint = await fileComplaint(c);
    const d = await setup("COMPLETED", shopRef);
    const resolvedComplaint = await fileComplaint(d);
    await admin(d, resolvedComplaint, { action: "resolve", note: "Sorted out" });
    const other = await setup("PREPARING");
    const otherShopRefund = await requestRefund(other);
    const cookie = a.adminCookie;
    const ids = (rows: ListedDispute[]) => rows.map((r) => r.id);

    const active = await list(cookie, `?shopId=${a.shop.id}`);
    expect(ids(active)).toEqual([escalatedRefund, openRefund, openComplaint]);
    expect(active.every((r) => r.order.shop.id === a.shop.id)).toBe(true);
    expect(ids(await list(cookie, `?status=active&shopId=${a.shop.id}`))).toEqual(ids(active));
    expect(ids(await list(cookie, `?status=RESOLVED&shopId=${a.shop.id}`))).toEqual([resolvedComplaint]);
    expect(ids(await list(cookie, `?status=ESCALATED&shopId=${a.shop.id}`))).toEqual([escalatedRefund]);
    expect(ids(await list(cookie, `?type=COMPLAINT&shopId=${a.shop.id}`))).toEqual([openComplaint]);
    expect(ids(await list(cookie, `?type=REFUND&shopId=${a.shop.id}`))).toEqual([escalatedRefund, openRefund]);
    expect(ids(await list(cookie, `?status=all&shopId=${a.shop.id}`)).sort()).toEqual(
      [openRefund, escalatedRefund, openComplaint, resolvedComplaint].sort(),
    );

    // Without a shop filter every shop's active disputes show, escalated ones before open ones.
    const all = ids(await list(cookie, ""));
    expect(all).toEqual(expect.arrayContaining([openRefund, escalatedRefund, openComplaint, otherShopRefund]));
    expect(all).not.toContain(resolvedComplaint);
    expect(all.indexOf(escalatedRefund)).toBeLessThan(all.indexOf(openRefund));

    expect((await getDisputes(apiRequest("/api/admin/disputes?status=CLOSED", { cookie }))).status).toBe(400);
    expect((await getDisputes(apiRequest("/api/admin/disputes?type=OTHER", { cookie }))).status).toBe(400);
  });

  it("detail has the order's items and timeline; unknown id 404", async () => {
    const s = await setup("PREPARING");
    const id = await escalated(s);
    const res = await getDispute(apiRequest(`/api/admin/disputes/${id}`, { cookie: s.adminCookie }), { params: Promise.resolve({ id }) });
    expect(res.status).toBe(200);
    const { dispute } = (await res.json()) as {
      dispute: {
        id: string;
        status: string;
        shopResponse: string;
        order: { id: string; items: { id: string }[]; events: { toStatus: string }[]; customer: { id: string } };
      };
    };
    expect(dispute).toMatchObject({ id, status: "ESCALATED", shopResponse: "The food is fine", order: { id: s.order.id, customer: { id: s.customer.id } } });
    expect(dispute.order.items.map((i) => i.id)).toEqual([s.dosaItem.id, s.teaItem.id]);
    expect(dispute.order.events.map((e) => e.toStatus)).toEqual(["PREPARING", "REFUND_REQUESTED", "PREPARING"]);

    const missing = await getDispute(apiRequest("/api/admin/disputes/nope", { cookie: s.adminCookie }), { params: Promise.resolve({ id: "nope" }) });
    expect(missing.status).toBe(404);
  });
});
