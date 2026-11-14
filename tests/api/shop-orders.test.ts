import { describe, expect, it } from "vitest";
import type { OrderStatus } from "@/generated/prisma/enums";
import { GET as listOrders } from "@/app/api/shops/[shopId]/orders/route";
import { GET as getOrder } from "@/app/api/shops/[shopId]/orders/[orderId]/route";
import { POST as postStatus } from "@/app/api/shops/[shopId]/orders/[orderId]/status/route";
import { KITCHEN_TARGETS } from "@/lib/order-status";
import { prisma } from "@/server/db";
import { apiRequest, createDish, createOrderWith, createShopOwner, createUser, sessionCookie } from "../helpers/fixtures";

const ALL_STATUSES: OrderStatus[] = [
  "PENDING_PAYMENT",
  "PAYMENT_FAILED",
  "PLACED_PAID",
  "PREPARING",
  "READY_FOR_PICKUP",
  "COMPLETED",
  "REFUND_REQUESTED",
  "REFUNDED",
  "COMPLAINT_FILED",
  "RESOLVED",
];
const VALID_KITCHEN_MOVES: [OrderStatus, OrderStatus][] = [
  ["PLACED_PAID", "PREPARING"],
  ["PREPARING", "READY_FOR_PICKUP"],
  ["READY_FOR_PICKUP", "COMPLETED"],
];
const UNPAID: OrderStatus[] = ["PENDING_PAYMENT", "PAYMENT_FAILED"];

interface OrderSummary {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  paymentStatus: string;
  totalPaise: number;
  createdAt: string;
  customer: { name: string };
  items: { id: string; nameAtOrder: string; quantity: number }[];
}
type Counts = Record<"active" | "completed" | "disputes", number>;
interface ErrorBody {
  error: { code: string; message: string };
}

const ordersCtx = (shopId: string) => ({ params: Promise.resolve({ shopId }) });
const orderCtx = (shopId: string, orderId: string) => ({ params: Promise.resolve({ shopId, orderId }) });

async function shopSetup() {
  const { owner, shop } = await createShopOwner();
  const customer = await createUser();
  return { owner, shop, customer, cookie: await sessionCookie(owner) };
}

async function list(shopId: string, cookie: string, filter?: string) {
  const qs = filter === undefined ? "" : `?filter=${encodeURIComponent(filter)}`;
  const res = await listOrders(apiRequest(`/api/shops/${shopId}/orders${qs}`, { cookie }), ordersCtx(shopId));
  return { res, body: (await res.json()) as { filter: string; orders: OrderSummary[]; counts: Counts } & Partial<ErrorBody> };
}

async function detail(shopId: string, orderId: string, cookie: string) {
  const res = await getOrder(apiRequest(`/api/shops/${shopId}/orders/${orderId}`, { cookie }), orderCtx(shopId, orderId));
  return { res, body: (await res.json()) as { order: Record<string, unknown> } };
}

async function move(shopId: string, orderId: string, cookie: string, to: unknown) {
  const res = await postStatus(
    apiRequest(`/api/shops/${shopId}/orders/${orderId}/status`, { cookie, json: { to } }),
    orderCtx(shopId, orderId),
  );
  return { res, body: (await res.json()) as { order: { id: string; status: OrderStatus; fromStatus: OrderStatus } } & Partial<ErrorBody> };
}

async function orderState(orderId: string) {
  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId }, select: { status: true, paymentStatus: true } });
  return { ...order, events: await prisma.orderEvent.count({ where: { orderId } }) };
}

describe("GET /api/shops/:shopId/orders", () => {
  it("splits orders into active / completed / disputes, never showing unpaid ones", async () => {
    const { shop, customer, cookie } = await shopSetup();
    const base = Date.now() - 60 * 60_000;
    const byStatus = new Map<OrderStatus, string>();
    // Created so that later statuses are newer; READY_FOR_PICKUP is made the oldest active order on purpose.
    for (const [i, status] of ALL_STATUSES.entries()) {
      const minutes = status === "READY_FOR_PICKUP" ? -10 : i;
      const order = await createOrderWith({ customerId: customer.id, shopId: shop.id, status, createdAt: new Date(base + minutes * 60_000) });
      byStatus.set(status, order.id);
    }
    const ids = (...statuses: OrderStatus[]) => statuses.map((s) => byStatus.get(s));

    const active = await list(shop.id, cookie, "active");
    expect(active.res.status).toBe(200);
    expect(active.body.filter).toBe("active");
    // Kitchen queue: oldest first.
    expect(active.body.orders.map((o) => o.id)).toEqual(ids("READY_FOR_PICKUP", "PLACED_PAID", "PREPARING"));

    // Default filter is active.
    expect((await list(shop.id, cookie)).body.orders.map((o) => o.id)).toEqual(active.body.orders.map((o) => o.id));

    const completed = await list(shop.id, cookie, "completed");
    expect(completed.body.orders.map((o) => o.id).sort()).toEqual(ids("COMPLETED", "REFUNDED", "RESOLVED").sort());
    const disputes = await list(shop.id, cookie, "disputes");
    expect(disputes.body.orders.map((o) => o.id).sort()).toEqual(ids("REFUND_REQUESTED", "COMPLAINT_FILED").sort());

    const expectedCounts: Counts = { active: 3, completed: 3, disputes: 2 };
    for (const r of [active, completed, disputes]) expect(r.body.counts).toEqual(expectedCounts);

    const everyListed = [active, completed, disputes].flatMap((r) => r.body.orders.map((o) => o.id));
    for (const status of UNPAID) {
      expect(everyListed).not.toContain(byStatus.get(status));
      expect((await detail(shop.id, byStatus.get(status)!, cookie)).res.status).toBe(404);
    }
  });

  it("returns customer name, items with quantities, total, payment status and createdAt", async () => {
    const { shop, customer, cookie } = await shopSetup();
    const chai = await createDish(shop.id, { name: "Chai", pricePaise: 1500 });
    const kachori = await createDish(shop.id, { name: "Kachori", pricePaise: 2500 });
    const order = await createOrderWith({
      customerId: customer.id,
      shopId: shop.id,
      status: "PLACED_PAID",
      items: [
        { menuItemId: kachori.id, name: "Kachori", quantity: 1, pricePaise: 2500 },
        { menuItemId: chai.id, name: "Chai", quantity: 3, pricePaise: 1500 },
      ],
    });

    const { body } = await list(shop.id, cookie, "active");
    expect(body.orders).toHaveLength(1);
    const row = body.orders[0]!;
    expect(row).toMatchObject({
      id: order.id,
      orderNumber: order.orderNumber,
      status: "PLACED_PAID",
      paymentStatus: "PAID",
      totalPaise: 7000,
      customer: { name: customer.name },
      createdAt: order.createdAt.toISOString(),
    });
    expect(row.items.map((i) => [i.nameAtOrder, i.quantity])).toEqual([
      ["Chai", 3],
      ["Kachori", 1],
    ]);
  });

  it("rejects an unknown filter with 400", async () => {
    const { shop, cookie } = await shopSetup();
    const { res, body } = await list(shop.id, cookie, "pending");
    expect(res.status).toBe(400);
    expect(body.error?.code).toBe("VALIDATION_ERROR");
  });

  it("401 without a session, 403 for a customer", async () => {
    const { shop, customer } = await shopSetup();
    expect((await listOrders(apiRequest(`/api/shops/${shop.id}/orders`), ordersCtx(shop.id))).status).toBe(401);
    expect((await list(shop.id, await sessionCookie(customer))).res.status).toBe(403);
  });
});

describe("GET /api/shops/:shopId/orders/:orderId", () => {
  it("returns items, the event timeline and complaints", async () => {
    const { owner, shop, customer, cookie } = await shopSetup();
    const order = await createOrderWith({ customerId: customer.id, shopId: shop.id, status: "COMPLAINT_FILED" });
    await prisma.orderEvent.createMany({
      data: [
        { orderId: order.id, fromStatus: "PENDING_PAYMENT", toStatus: "PLACED_PAID", createdAt: new Date(Date.now() - 3000) },
        { orderId: order.id, fromStatus: "PLACED_PAID", toStatus: "PREPARING", actorId: owner.id, createdAt: new Date(Date.now() - 2000) },
        { orderId: order.id, fromStatus: "PREPARING", toStatus: "COMPLAINT_FILED", actorId: customer.id, createdAt: new Date(Date.now() - 1000) },
      ],
    });
    await prisma.complaint.create({
      data: { orderId: order.id, raisedById: customer.id, type: "COMPLAINT", description: "Cold food", itemIds: [] },
    });

    const { res, body } = await detail(shop.id, order.id, cookie);
    expect(res.status).toBe(200);
    const o = body.order as {
      id: string;
      status: string;
      customer: { name: string };
      items: { nameAtOrder: string; quantity: number; pricePaiseAtOrder: number }[];
      events: { fromStatus: string | null; toStatus: string; actor: { name: string; role: string } | null }[];
      complaints: { type: string; status: string; description: string }[];
    };
    expect(o).toMatchObject({ id: order.id, status: "COMPLAINT_FILED", customer: { name: customer.name } });
    expect(o.items).toHaveLength(1);
    expect(o.items[0]).toMatchObject({ quantity: 2, pricePaiseAtOrder: 2500 });
    expect(o.events.map((e) => [e.fromStatus, e.toStatus])).toEqual([
      ["PENDING_PAYMENT", "PLACED_PAID"],
      ["PLACED_PAID", "PREPARING"],
      ["PREPARING", "COMPLAINT_FILED"],
    ]);
    expect(o.events[0]!.actor).toBeNull();
    expect(o.events[1]!.actor).toEqual({ name: owner.name, role: "SHOP_OWNER" });
    expect(o.complaints).toEqual([expect.objectContaining({ type: "COMPLAINT", status: "OPEN", description: "Cold food" })]);
  });

  it("404s an unknown order", async () => {
    const { shop, cookie } = await shopSetup();
    expect((await detail(shop.id, "no-such-order", cookie)).res.status).toBe(404);
  });
});

describe("POST /api/shops/:shopId/orders/:orderId/status", () => {
  it("walks PLACED_PAID → PREPARING → READY_FOR_PICKUP → COMPLETED, logging events and notifying the customer", async () => {
    const { owner, shop, customer, cookie } = await shopSetup();
    const order = await createOrderWith({ customerId: customer.id, shopId: shop.id, status: "PLACED_PAID" });

    for (const [from, to] of VALID_KITCHEN_MOVES) {
      const { res, body } = await move(shop.id, order.id, cookie, to);
      expect(res.status).toBe(200);
      expect(body.order).toMatchObject({ id: order.id, fromStatus: from, status: to });
      expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe(to);

      const events = await prisma.orderEvent.findMany({ where: { orderId: order.id, toStatus: to } });
      expect(events).toEqual([expect.objectContaining({ fromStatus: from, toStatus: to, actorId: owner.id })]);
    }

    expect(await prisma.orderEvent.count({ where: { orderId: order.id } })).toBe(3);
    const customerNotes = await prisma.notification.findMany({ where: { userId: customer.id } });
    expect(customerNotes).toHaveLength(3);
    for (const n of customerNotes) expect(n).toMatchObject({ type: "ORDER_STATUS", link: `/orders/${order.id}` });
    expect(customerNotes.map((n) => n.body).sort()).toEqual(
      [
        "The shop has started preparing your order.",
        "Your order is ready for pickup!",
        "Order completed. Enjoy your food!",
      ].sort(),
    );
    // The shop does not notify itself about its own kitchen actions.
    expect(await prisma.notification.count({ where: { userId: owner.id } })).toBe(0);
  });

  const invalidMoves = ALL_STATUSES.flatMap((from) =>
    KITCHEN_TARGETS.filter((to) => !VALID_KITCHEN_MOVES.some(([f, t]) => f === from && t === to)).map((to) => [from, to] as const),
  );

  it(`rejects all ${invalidMoves.length} invalid kitchen moves without touching the order`, async () => {
    expect(invalidMoves).toHaveLength(ALL_STATUSES.length * KITCHEN_TARGETS.length - VALID_KITCHEN_MOVES.length);
    const { shop, customer, cookie } = await shopSetup();
    for (const [from, to] of invalidMoves) {
      const order = await createOrderWith({ customerId: customer.id, shopId: shop.id, status: from });
      const before = await orderState(order.id);
      const { res, body } = await move(shop.id, order.id, cookie, to);
      const expected = UNPAID.includes(from) ? { status: 404, code: "NOT_FOUND" } : { status: 409, code: "INVALID_TRANSITION" };
      expect({ from, to, status: res.status, code: body.error?.code }).toEqual({ from, to, ...expected });
      expect(await orderState(order.id)).toEqual(before);
    }
    expect(await prisma.notification.count({ where: { userId: customer.id } })).toBe(0);
  });

  it("never resolves a refund request back to PREPARING through a kitchen action (409)", async () => {
    const { shop, customer, cookie } = await shopSetup();
    const order = await createOrderWith({ customerId: customer.id, shopId: shop.id, status: "REFUND_REQUESTED" });
    await prisma.orderEvent.create({
      data: { orderId: order.id, fromStatus: "PREPARING", toStatus: "REFUND_REQUESTED", actorId: customer.id },
    });
    const before = await orderState(order.id);
    const { res, body } = await move(shop.id, order.id, cookie, "PREPARING");
    expect(res.status).toBe(409);
    expect(body.error?.code).toBe("INVALID_TRANSITION");
    expect(await orderState(order.id)).toEqual(before);
  });

  it.each(["REFUNDED", "RESOLVED", "PLACED_PAID", "REFUND_REQUESTED", "bogus", undefined])(
    "rejects target %s with 400 VALIDATION_ERROR",
    async (to) => {
      const { shop, customer, cookie } = await shopSetup();
      const order = await createOrderWith({ customerId: customer.id, shopId: shop.id, status: "PLACED_PAID" });
      const before = await orderState(order.id);
      const { res, body } = await move(shop.id, order.id, cookie, to);
      expect(res.status).toBe(400);
      expect(body.error?.code).toBe("VALIDATION_ERROR");
      expect(await orderState(order.id)).toEqual(before);
    },
  );

  it("rejects a customer (403) and a suspended owner (403 ACCOUNT_SUSPENDED)", async () => {
    const { owner, shop, customer, cookie } = await shopSetup();
    const order = await createOrderWith({ customerId: customer.id, shopId: shop.id, status: "PLACED_PAID" });
    const before = await orderState(order.id);

    const asCustomer = await move(shop.id, order.id, await sessionCookie(customer), "PREPARING");
    expect(asCustomer.res.status).toBe(403);
    expect(asCustomer.body.error?.code).toBe("FORBIDDEN");

    await prisma.user.update({ where: { id: owner.id }, data: { status: "SUSPENDED" } });
    const suspended = await move(shop.id, order.id, cookie, "PREPARING");
    expect(suspended.res.status).toBe(403);
    expect(suspended.body.error?.code).toBe("ACCOUNT_SUSPENDED");
    expect(await orderState(order.id)).toEqual(before);
  });

  it("lets exactly one of two concurrent identical requests win", async () => {
    const { shop, customer, cookie } = await shopSetup();
    const order = await createOrderWith({ customerId: customer.id, shopId: shop.id, status: "PLACED_PAID" });
    const results = await Promise.all([move(shop.id, order.id, cookie, "PREPARING"), move(shop.id, order.id, cookie, "PREPARING")]);
    expect(results.map((r) => r.res.status).sort()).toEqual([200, 409]);
    const loser = results.find((r) => r.res.status === 409)!;
    expect(["ORDER_CHANGED", "INVALID_TRANSITION"]).toContain(loser.body.error?.code);
    expect(await orderState(order.id)).toEqual({ status: "PREPARING", paymentStatus: "PAID", events: 1 });
    expect(await prisma.notification.count({ where: { userId: customer.id } })).toBe(1);
  });
});
