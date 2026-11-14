import { describe, expect, it } from "vitest";
import type { OrderStatus } from "@/generated/prisma/enums";
import { GET as listOrders } from "@/app/api/orders/route";
import { GET as getOrder } from "@/app/api/orders/[orderId]/route";
import { POST as postStatus } from "@/app/api/shops/[shopId]/orders/[orderId]/status/route";
import { prisma } from "@/server/db";
import { getCustomerOrderDetail } from "@/server/orders/history";
import { apiRequest, createDish, createOrderWith, createShopOwner, createUser, sessionCookie } from "../helpers/fixtures";

interface DetailBody {
  order: {
    id: string;
    status: OrderStatus;
    items: { nameAtOrder: string; quantity: number; prepTimeMinutes: number }[];
    events: { fromStatus: OrderStatus | null; toStatus: OrderStatus; createdAt: string; actor: { role: string } | null }[];
    steps: { status: OrderStatus; state: "done" | "current" | "upcoming"; at: string | null }[];
    estimate: { kind: string; readyAt?: string; prepMinutes?: number } | null;
  };
  error?: { code: string };
}
interface ListBody {
  tab: string;
  orders: { id: string; orderNumber: string; status: OrderStatus; shop: { name: string }; items: unknown[] }[];
  counts: { active: number; past: number };
  error?: { code: string };
}

const orderCtx = (orderId: string) => ({ params: Promise.resolve({ orderId }) });

async function detail(orderId: string, cookie?: string) {
  const res = await getOrder(apiRequest(`/api/orders/${orderId}`, { cookie }), orderCtx(orderId));
  return { res, body: (await res.json()) as DetailBody };
}

async function list(cookie: string, tab?: string) {
  const qs = tab === undefined ? "" : `?tab=${encodeURIComponent(tab)}`;
  const res = await listOrders(apiRequest(`/api/orders${qs}`, { cookie }));
  return { res, body: (await res.json()) as ListBody };
}

async function kitchen(shopId: string, orderId: string, cookie: string, to: OrderStatus) {
  const res = await postStatus(apiRequest(`/api/shops/${shopId}/orders/${orderId}/status`, { cookie, json: { to } }), {
    params: Promise.resolve({ shopId, orderId }),
  });
  expect(res.status).toBe(200);
}

const states = (body: DetailBody) => body.order.steps.map((s) => s.state);

describe("order lifecycle as the customer sees it", () => {
  it("PLACED_PAID → PREPARING → READY_FOR_PICKUP → COMPLETED: 3 events, 3 customer notifications, timeline and estimate", async () => {
    const { owner, shop } = await createShopOwner();
    const customer = await createUser();
    const [tea, dosa] = await Promise.all([
      createDish(shop.id, { name: "Tea", prepTimeMinutes: 4 }),
      createDish(shop.id, { name: "Dosa", prepTimeMinutes: 14 }),
    ]);
    const order = await createOrderWith({
      customerId: customer.id,
      shopId: shop.id,
      status: "PLACED_PAID",
      items: [
        { menuItemId: tea.id, name: tea.name, quantity: 2, pricePaise: tea.pricePaise },
        { menuItemId: dosa.id, name: dosa.name, quantity: 1, pricePaise: dosa.pricePaise },
      ],
    });
    const customerCookie = await sessionCookie(customer);
    const shopCookie = await sessionCookie(owner);

    let view = await detail(order.id, customerCookie);
    expect(view.res.status).toBe(200);
    expect(states(view.body)).toEqual(["current", "upcoming", "upcoming", "upcoming"]);
    expect(view.body.order.estimate).toEqual({ kind: "after-start", prepMinutes: 14 });
    expect(view.body.order.items.map((i) => [i.nameAtOrder, i.prepTimeMinutes])).toEqual([
      ["Dosa", 14],
      ["Tea", 4],
    ]);

    await kitchen(shop.id, order.id, shopCookie, "PREPARING");
    view = await detail(order.id, customerCookie);
    expect(view.body.order.status).toBe("PREPARING");
    expect(states(view.body)).toEqual(["done", "current", "upcoming", "upcoming"]);
    const startedAt = new Date(view.body.order.events.find((e) => e.toStatus === "PREPARING")!.createdAt);
    expect(view.body.order.estimate).toEqual({
      kind: "eta",
      readyAt: new Date(startedAt.getTime() + 14 * 60_000).toISOString(),
      prepMinutes: 14,
    });

    await kitchen(shop.id, order.id, shopCookie, "READY_FOR_PICKUP");
    view = await detail(order.id, customerCookie);
    expect(states(view.body)).toEqual(["done", "done", "current", "upcoming"]);
    expect(view.body.order.estimate).toMatchObject({ kind: "ready" });

    await kitchen(shop.id, order.id, shopCookie, "COMPLETED");
    view = await detail(order.id, customerCookie);
    expect(view.body.order.status).toBe("COMPLETED");
    expect(states(view.body)).toEqual(["done", "done", "done", "done"]);
    expect(view.body.order.estimate).toBeNull();

    // Exactly three OrderEvents, in order, made by the shop — the customer's timeline.
    expect(view.body.order.events.map((e) => [e.fromStatus, e.toStatus, e.actor?.role])).toEqual([
      ["PLACED_PAID", "PREPARING", "SHOP_OWNER"],
      ["PREPARING", "READY_FOR_PICKUP", "SHOP_OWNER"],
      ["READY_FOR_PICKUP", "COMPLETED", "SHOP_OWNER"],
    ]);
    expect(await prisma.orderEvent.count({ where: { orderId: order.id } })).toBe(3);
    // Every step after Placed & paid carries the time of its event.
    expect(view.body.order.steps.slice(1).map((s) => s.at)).toEqual(view.body.order.events.map((e) => e.createdAt));

    // Exactly three notifications for the customer, each linking to this order page.
    const notes = await prisma.notification.findMany({ where: { userId: customer.id }, orderBy: { createdAt: "asc" } });
    expect(notes).toHaveLength(3);
    expect(notes.map((n) => n.body)).toEqual([
      "The shop has started preparing your order.",
      "Your order is ready for pickup!",
      "Order completed. Enjoy your food!",
    ]);
    for (const n of notes) expect(n).toMatchObject({ type: "ORDER_STATUS", link: `/orders/${order.id}`, readAt: null });

    // The order moved from the Active tab to the Past tab.
    const active = await list(customerCookie, "active");
    const past = await list(customerCookie, "past");
    expect(active.body.orders.map((o) => o.id)).not.toContain(order.id);
    expect(past.body.orders.map((o) => o.id)).toContain(order.id);
  });
});

describe("GET /api/orders/:orderId access", () => {
  async function setup(status: OrderStatus = "PREPARING") {
    const { owner, shop } = await createShopOwner();
    const customer = await createUser();
    const order = await createOrderWith({ customerId: customer.id, shopId: shop.id, status });
    return { owner, shop, customer, order };
  }

  it("the order's customer can see it", async () => {
    const { customer, order } = await setup();
    const { res, body } = await detail(order.id, await sessionCookie(customer));
    expect(res.status).toBe(200);
    expect(body.order).toMatchObject({ id: order.id, status: "PREPARING" });
  });

  it("another customer gets 404 (not 403), and the page query returns nothing", async () => {
    const { order } = await setup();
    const stranger = await createUser();
    const { res, body } = await detail(order.id, await sessionCookie(stranger));
    expect(res.status).toBe(404);
    expect(body.error?.code).toBe("NOT_FOUND");
    expect(JSON.stringify(body)).not.toContain(order.orderNumber);
    expect(await getCustomerOrderDetail(order.id, stranger.id)).toBeNull();
  });

  it("another shop's owner gets 404; the order's own shop sees paid orders but not unpaid ones", async () => {
    const { owner, order } = await setup();
    const other = await createShopOwner();
    expect((await detail(order.id, await sessionCookie(other.owner))).res.status).toBe(404);
    expect((await detail(order.id, await sessionCookie(owner))).res.status).toBe(200);

    const unpaid = await setup("PENDING_PAYMENT");
    expect((await detail(unpaid.order.id, await sessionCookie(unpaid.owner))).res.status).toBe(404);
    expect((await detail(unpaid.order.id, await sessionCookie(unpaid.customer))).res.status).toBe(200);
  });

  it("admins can see any order", async () => {
    const { order } = await setup();
    const admin = await createUser({ role: "ADMIN" });
    expect((await detail(order.id, await sessionCookie(admin))).res.status).toBe(200);
  });

  it("401 when logged out, 403 when suspended, 404 for an unknown id", async () => {
    const { customer, order } = await setup();
    expect((await detail(order.id)).res.status).toBe(401);
    await prisma.user.update({ where: { id: customer.id }, data: { status: "SUSPENDED" } });
    const suspended = await detail(order.id, await sessionCookie(customer));
    expect(suspended.res.status).toBe(403);
    expect(suspended.body.error?.code).toBe("ACCOUNT_SUSPENDED");
    const other = await createUser();
    expect((await detail("no-such-order", await sessionCookie(other))).res.status).toBe(404);
  });
});

describe("GET /api/orders (history tabs)", () => {
  it("splits the customer's own orders into Active and Past, newest first, with counts", async () => {
    const { shop } = await createShopOwner();
    const customer = await createUser();
    const stranger = await createUser();
    const base = Date.now() - 60 * 60_000;
    const make = (status: OrderStatus, minutes: number, customerId = customer.id) =>
      createOrderWith({ customerId, shopId: shop.id, status, createdAt: new Date(base + minutes * 60_000) });

    const pending = await make("PENDING_PAYMENT", 1);
    const placed = await make("PLACED_PAID", 2);
    const preparing = await make("PREPARING", 3);
    const ready = await make("READY_FOR_PICKUP", 4);
    const refundRequested = await make("REFUND_REQUESTED", 5);
    const complaint = await make("COMPLAINT_FILED", 6);
    const completed = await make("COMPLETED", 7);
    const refunded = await make("REFUNDED", 8);
    const resolved = await make("RESOLVED", 9);
    const failed = await make("PAYMENT_FAILED", 10);
    const strangers = await make("PREPARING", 11, stranger.id);

    const cookie = await sessionCookie(customer);
    const active = await list(cookie);
    expect(active.res.status).toBe(200);
    expect(active.body.tab).toBe("active");
    expect(active.body.orders.map((o) => o.id)).toEqual(
      [complaint, refundRequested, ready, preparing, placed, pending].map((o) => o.id),
    );
    expect(active.body.orders[0]).toMatchObject({ shop: { name: shop.name } });
    expect(active.body.orders[0]!.items).toHaveLength(1);

    const past = await list(cookie, "past");
    expect(past.body.orders.map((o) => o.id)).toEqual([failed, resolved, refunded, completed].map((o) => o.id));
    expect(past.body.counts).toEqual({ active: 6, past: 4 });

    for (const body of [active.body, past.body]) expect(body.orders.map((o) => o.id)).not.toContain(strangers.id);
  });

  it("rejects an unknown tab, non-customers and logged-out users", async () => {
    const customer = await createUser();
    const bad = await list(await sessionCookie(customer), "everything");
    expect(bad.res.status).toBe(400);
    expect(bad.body.error?.code).toBe("VALIDATION_ERROR");

    const { owner } = await createShopOwner();
    expect((await list(await sessionCookie(owner))).res.status).toBe(403);
    const admin = await createUser({ role: "ADMIN" });
    expect((await list(await sessionCookie(admin))).res.status).toBe(403);
    const res = await listOrders(apiRequest("/api/orders"));
    expect(res.status).toBe(401);
  });

  it("a customer with no orders gets empty lists and zero counts", async () => {
    const customer = await createUser();
    const { body } = await list(await sessionCookie(customer), "past");
    expect(body).toEqual({ tab: "past", orders: [], counts: { active: 0, past: 0 } });
  });
});
