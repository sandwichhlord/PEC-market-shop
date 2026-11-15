// Socket.IO integration: a real server with attachRealtime() on a random port and real socket.io-client
// connections carrying session cookies, exactly as browsers do.
import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { Server } from "socket.io";
import { io as connectClient, type Socket } from "socket.io-client";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { SubscribeAck, Subscription } from "@/lib/realtime/protocol";
import { prisma } from "@/server/db";
import { changeStatus } from "@/server/orders/changeStatus";
import { attachRealtime } from "@/server/realtime/server";
import { setStock } from "@/server/shops/menu";
import { updateShopProfile } from "@/server/shops/profile";
import { createDish, createOrderWith, createShopOwner, createUser, sessionCookie } from "./helpers/fixtures";

let http: HttpServer;
let io: Server;
let url: string;
const clients: Socket[] = [];

beforeAll(async () => {
  http = createServer();
  io = new Server(http);
  attachRealtime(io);
  globalThis.io = io;
  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
  url = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
});

afterEach(() => {
  for (const c of clients.splice(0)) c.disconnect();
});

afterAll(async () => {
  globalThis.io = undefined;
  await io.close();
});

function open(cookie?: string): Socket {
  const socket = connectClient(url, {
    transports: ["websocket"],
    reconnection: false,
    forceNew: true,
    extraHeaders: cookie ? { cookie } : {},
  });
  clients.push(socket);
  return socket;
}

/** Connects and resolves once the handshake is accepted; rejects with the server's error message otherwise. */
function connect(cookie?: string): Promise<Socket> {
  const socket = open(cookie);
  return new Promise((resolve, reject) => {
    socket.once("connect", () => resolve(socket));
    socket.once("connect_error", (err) => reject(err));
  });
}

async function connectAs(user: { id: string; role: Parameters<typeof sessionCookie>[0]["role"] }): Promise<Socket> {
  return connect(await sessionCookie(user));
}

const subscribe = (socket: Socket, sub: unknown) =>
  socket.timeout(5000).emitWithAck("subscribe", sub) as Promise<SubscribeAck>;

async function socketsIn(room: string) {
  return (await io.in(room).fetchSockets()).map((s) => s.id);
}

/** Records every event of the given names a socket receives. */
function record(socket: Socket, names: string[]) {
  const got: { name: string; payload: Record<string, unknown> }[] = [];
  for (const name of names) socket.on(name, (payload: Record<string, unknown>) => got.push({ name, payload }));
  return got;
}

async function until(check: () => boolean, ms = 3000) {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > ms) throw new Error("timed out waiting for a real-time event");
    await new Promise((r) => setTimeout(r, 20));
  }
}
const settle = () => new Promise((r) => setTimeout(r, 300));

describe("handshake authentication", () => {
  it("refuses connections without a session cookie or with a tampered one", async () => {
    await expect(connect()).rejects.toThrow("UNAUTHENTICATED");
    const user = await createUser();
    const cookie = await sessionCookie(user);
    await expect(connect(`${cookie}x`)).rejects.toThrow("UNAUTHENTICATED");
  });

  it("refuses suspended users", async () => {
    const user = await createUser({ status: "SUSPENDED" });
    await expect(connectAs(user)).rejects.toThrow("ACCOUNT_SUSPENDED");
  });

  it("refuses a token whose role no longer matches the user", async () => {
    const user = await createUser();
    await expect(connect(await sessionCookie({ id: user.id, role: "ADMIN" }))).rejects.toThrow("UNAUTHENTICATED");
  });
});

describe("home rooms", () => {
  it("customers join user:<id> only", async () => {
    const user = await createUser();
    const socket = await connectAs(user);
    expect(await socketsIn(`user:${user.id}`)).toEqual([socket.id]);
    expect(await socketsIn("admin")).not.toContain(socket.id);
  });

  it("shop owners also join shop:<shopId>; admins join admin", async () => {
    const { owner, shop } = await createShopOwner();
    const admin = await createUser({ role: "ADMIN" });
    const ownerSocket = await connectAs(owner);
    const adminSocket = await connectAs(admin);
    expect(await socketsIn(`shop:${shop.id}`)).toEqual([ownerSocket.id]);
    expect(await socketsIn(`user:${owner.id}`)).toEqual([ownerSocket.id]);
    expect(await socketsIn("admin")).toContain(adminSocket.id);
    expect(await socketsIn("admin")).not.toContain(ownerSocket.id);
  });
});

describe("subscriptions", () => {
  it("a customer may watch their own order but not someone else's", async () => {
    const { shop } = await createShopOwner();
    const customer = await createUser();
    const stranger = await createUser();
    const order = await createOrderWith({ customerId: customer.id, shopId: shop.id, status: "PREPARING" });
    const mine = await connectAs(customer);
    const theirs = await connectAs(stranger);

    expect(await subscribe(mine, { kind: "order", id: order.id })).toEqual({ ok: true });
    expect(await subscribe(theirs, { kind: "order", id: order.id })).toEqual({ ok: false, error: "NOT_FOUND" });
    expect(await socketsIn(`order:${order.id}`)).toEqual([mine.id]);

    mine.emit("unsubscribe", { kind: "order", id: order.id } satisfies Subscription);
    await settle();
    expect(await socketsIn(`order:${order.id}`)).toEqual([]);
  });

  it("the shop owner may watch its paid orders but not unpaid ones or other shops' orders; admins may watch any", async () => {
    const { owner, shop } = await createShopOwner();
    const other = await createShopOwner();
    const admin = await createUser({ role: "ADMIN" });
    const customer = await createUser();
    const paid = await createOrderWith({ customerId: customer.id, shopId: shop.id, status: "PLACED_PAID" });
    const unpaid = await createOrderWith({ customerId: customer.id, shopId: shop.id, status: "PENDING_PAYMENT" });
    const ownerSocket = await connectAs(owner);
    const otherSocket = await connectAs(other.owner);
    const adminSocket = await connectAs(admin);

    expect(await subscribe(ownerSocket, { kind: "order", id: paid.id })).toEqual({ ok: true });
    expect(await subscribe(ownerSocket, { kind: "order", id: unpaid.id })).toEqual({ ok: false, error: "NOT_FOUND" });
    expect(await subscribe(otherSocket, { kind: "order", id: paid.id })).toEqual({ ok: false, error: "NOT_FOUND" });
    expect(await subscribe(adminSocket, { kind: "order", id: unpaid.id })).toEqual({ ok: true });
  });

  it("any signed-in user may watch a visible shop's menu; unknown shops, suspended owners and bad input are refused", async () => {
    const { shop } = await createShopOwner();
    const hidden = await createShopOwner();
    await prisma.user.update({ where: { id: hidden.owner.id }, data: { status: "SUSPENDED" } });
    const socket = await connectAs(await createUser());

    expect(await subscribe(socket, { kind: "menu", id: shop.id })).toEqual({ ok: true });
    expect(await subscribe(socket, { kind: "menu", id: hidden.shop.id })).toEqual({ ok: false, error: "NOT_FOUND" });
    expect(await subscribe(socket, { kind: "menu", id: "no-such-shop" })).toEqual({ ok: false, error: "NOT_FOUND" });
    expect(await subscribe(socket, { kind: "user", id: "someone" })).toEqual({ ok: false, error: "BAD_REQUEST" });
    expect(await subscribe(socket, { kind: "order", id: "" })).toEqual({ ok: false, error: "BAD_REQUEST" });
    expect(await subscribe(socket, "admin")).toEqual({ ok: false, error: "BAD_REQUEST" });
    expect(await socketsIn(`menu:${shop.id}`)).toEqual([socket.id]);
  });

  it("any signed-in user may watch the shops list (shops:all), nothing else of that kind", async () => {
    const customer = await connectAs(await createUser());
    const owner = await connectAs((await createShopOwner()).owner);
    expect(await subscribe(customer, { kind: "shops", id: "all" })).toEqual({ ok: true });
    expect(await subscribe(owner, { kind: "shops", id: "all" })).toEqual({ ok: true });
    expect(await subscribe(customer, { kind: "shops", id: "some-shop" })).toEqual({ ok: false, error: "NOT_FOUND" });
    expect((await socketsIn("shops:all")).sort()).toEqual([customer.id, owner.id].sort());
  });
});

describe("events reach the right people", () => {
  const EVENTS = ["order:status", "notification:new", "menu:item"];

  it("a kitchen update goes to the customer (status + notification), the order room and the shop — nobody else", async () => {
    const { owner, shop } = await createShopOwner();
    const customer = await createUser();
    const admin = await createUser({ role: "ADMIN" });
    const stranger = await createUser();
    const order = await createOrderWith({ customerId: customer.id, shopId: shop.id, status: "PLACED_PAID" });

    const customerGot = record(await connectAs(customer), EVENTS);
    const watcher = await connectAs(admin);
    const adminGot = record(watcher, EVENTS);
    const shopGot = record(await connectAs(owner), EVENTS);
    const strangerGot = record(await connectAs(stranger), EVENTS);

    await changeStatus({ orderId: order.id, to: "PREPARING", actor: { id: owner.id, role: "SHOP_OWNER" } });

    await until(() => customerGot.length >= 2 && shopGot.length >= 1);
    expect(customerGot.find((e) => e.name === "order:status")?.payload).toMatchObject({
      orderId: order.id,
      fromStatus: "PLACED_PAID",
      status: "PREPARING",
    });
    expect(customerGot.find((e) => e.name === "notification:new")?.payload).toMatchObject({
      userId: customer.id,
      notification: { type: "ORDER_STATUS", body: "The shop has started preparing your order.", link: `/orders/${order.id}`, readAt: null },
    });
    const stored = await prisma.notification.findFirstOrThrow({ where: { userId: customer.id } });
    expect((customerGot.find((e) => e.name === "notification:new")?.payload.notification as { id: string }).id).toBe(stored.id);
    expect(shopGot.map((e) => e.name)).toEqual(["order:status"]);
    await settle();
    expect(adminGot).toEqual([]);
    expect(strangerGot).toEqual([]);

    // An admin watching the order room sees it too.
    expect(await subscribe(watcher, { kind: "order", id: order.id })).toEqual({ ok: true });
    await changeStatus({ orderId: order.id, to: "READY_FOR_PICKUP", actor: { id: owner.id, role: "SHOP_OWNER" } });
    await until(() => adminGot.length === 1);
    expect(adminGot[0]).toMatchObject({ name: "order:status", payload: { status: "READY_FOR_PICKUP" } });
  });

  it("a new paid order reaches the shop room with a NEW_ORDER notification for the owner", async () => {
    const { owner, shop } = await createShopOwner();
    const customer = await createUser();
    const order = await createOrderWith({ customerId: customer.id, shopId: shop.id, status: "PENDING_PAYMENT" });
    const shopGot = record(await connectAs(owner), EVENTS);

    await changeStatus({ orderId: order.id, to: "PLACED_PAID", actor: { id: null, role: "SYSTEM" }, payment: { paymentStatus: "PAID" } });
    await until(() => shopGot.length >= 2);
    expect(shopGot.find((e) => e.name === "order:status")?.payload).toMatchObject({ orderId: order.id, status: "PLACED_PAID" });
    expect(shopGot.find((e) => e.name === "notification:new")?.payload).toMatchObject({
      userId: owner.id,
      notification: { type: "NEW_ORDER", title: `New order ${order.orderNumber}` },
    });
  });

  it("dispute events reach the admin room (and the shop gets a DISPUTE notification)", async () => {
    const { owner, shop } = await createShopOwner();
    const customer = await createUser();
    const admin = await createUser({ role: "ADMIN" });
    const order = await createOrderWith({ customerId: customer.id, shopId: shop.id, status: "PREPARING" });
    const adminGot = record(await connectAs(admin), EVENTS);
    const shopGot = record(await connectAs(owner), EVENTS);

    await changeStatus({ orderId: order.id, to: "REFUND_REQUESTED", actor: { id: customer.id, role: "CUSTOMER" } });
    await until(() => adminGot.length >= 1 && shopGot.length >= 2);
    expect(adminGot).toEqual([{ name: "order:status", payload: expect.objectContaining({ status: "REFUND_REQUESTED" }) }]);
    expect(shopGot.find((e) => e.name === "notification:new")?.payload).toMatchObject({ notification: { type: "DISPUTE" } });
  });

  it("a stock toggle reaches everyone watching the menu and the shop, not other users", async () => {
    const { owner, shop } = await createShopOwner();
    const dish = await createDish(shop.id);
    const viewer = await connectAs(await createUser());
    expect(await subscribe(viewer, { kind: "menu", id: shop.id })).toEqual({ ok: true });
    const viewerGot = record(viewer, EVENTS);
    const shopGot = record(await connectAs(owner), EVENTS);
    const elsewhereGot = record(await connectAs(await createUser()), EVENTS);

    await setStock(shop.id, dish.id, false);
    await until(() => viewerGot.length === 1 && shopGot.length === 1);
    expect(viewerGot[0]).toEqual({
      name: "menu:item",
      payload: { type: "menu:item", shopId: shop.id, itemId: dish.id, inStock: false, archived: false },
    });
    await settle();
    expect(elsewhereGot).toEqual([]);
  });

  it("a shop opening or closing reaches the shops list watchers", async () => {
    const { shop } = await createShopOwner();
    const listViewer = await connectAs(await createUser());
    expect(await subscribe(listViewer, { kind: "shops", id: "all" })).toEqual({ ok: true });
    const listGot = record(listViewer, ["shop:updated"]);
    const elsewhereGot = record(await connectAs(await createUser()), ["shop:updated"]);

    await updateShopProfile(shop.id, { isOpen: false }, null);
    await until(() => listGot.length === 1);
    expect(listGot[0]).toEqual({ name: "shop:updated", payload: { type: "shop:updated", shopId: shop.id, isOpen: false } });
    await settle();
    expect(elsewhereGot).toEqual([]);
  });
});
