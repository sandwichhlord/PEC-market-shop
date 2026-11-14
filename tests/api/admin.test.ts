// P11 admin API: access control on every admin route, customer reports (shop → admin), account actions from the
// reports queue and the users list, suspension logging the user out, the shops directory and dashboard counts.
import { describe, expect, it, vi } from "vitest";
import { GET as getDisputes } from "@/app/api/admin/disputes/route";
import { GET as getDispute, POST as postDispute } from "@/app/api/admin/disputes/[id]/route";
import { GET as getReports } from "@/app/api/admin/reports/route";
import { POST as postReport } from "@/app/api/admin/reports/[id]/route";
import { GET as getAdminShops } from "@/app/api/admin/shops/route";
import { GET as getStats } from "@/app/api/admin/stats/route";
import { GET as getUsers } from "@/app/api/admin/users/route";
import { POST as postUser } from "@/app/api/admin/users/[id]/route";
import { GET as getMe } from "@/app/api/me/route";
import { GET as getMyOrders } from "@/app/api/orders/route";
import { GET as getShops } from "@/app/api/shops/route";
import { GET as getOrderReports, POST as postOrderReport } from "@/app/api/shops/[shopId]/orders/[orderId]/report/route";
import type { OrderStatus } from "@/generated/prisma/enums";
import { prisma } from "@/server/db";
import { apiRequest, createOrderWith, createShopOwner, createUser, sessionCookie, sessionCookieFrom, uid } from "../helpers/fixtures";

// Each test drives several routes end to end; give them room on a loaded machine.
vi.setConfig({ testTimeout: 60_000 });

interface ErrorBody {
  error?: { code: string; message: string };
}
interface ReportRow {
  id: string;
  reason: string;
  description: string;
  status: string;
  adminNote: string | null;
  customer?: { id: string; status: string; warningMessage: string | null };
}
interface UserRow {
  id: string;
  role: string;
  status: string;
  warningMessage: string | null;
}

type Body = ErrorBody & Record<string, unknown>;
const json = async <T = Body>(res: Response) => (await res.json()) as T & ErrorBody;
const idParams = (id: string) => ({ params: Promise.resolve({ id }) });

async function adminCookie() {
  const admin = await createUser({ role: "ADMIN" });
  return { admin, cookie: await sessionCookie(admin) };
}

/** A shop owner, a customer and a paid order between them in `status`. */
async function setup(status: OrderStatus = "COMPLETED") {
  const { owner, shop } = await createShopOwner();
  const customer = await createUser();
  const order = await createOrderWith({ customerId: customer.id, shopId: shop.id, status });
  return { owner, shop, customer, order, ownerCookie: await sessionCookie(owner), customerCookie: await sessionCookie(customer) };
}

async function fileReport(shopId: string, orderId: string, cookie: string, body: unknown) {
  const res = await postOrderReport(apiRequest(`/api/shops/${shopId}/orders/${orderId}/report`, { cookie, json: body }), {
    params: Promise.resolve({ shopId, orderId }),
  });
  return { res, body: await json<{ report: ReportRow }>(res) };
}

async function actOnReport(id: string, cookie: string, body: unknown) {
  const res = await postReport(apiRequest(`/api/admin/reports/${id}`, { cookie, json: body }), idParams(id));
  return { res, body: await json<{ changed: boolean; report: ReportRow }>(res) };
}

async function actOnUser(id: string, cookie: string, body: unknown) {
  const res = await postUser(apiRequest(`/api/admin/users/${id}`, { cookie, json: body }), idParams(id));
  return { res, body: await json<{ changed: boolean; user: UserRow }>(res) };
}

async function listReports(cookie: string, query = "") {
  const res = await getReports(apiRequest(`/api/admin/reports${query}`, { cookie }));
  return (await json<{ reports: ReportRow[] }>(res)).reports;
}

async function listUsers(cookie: string, query: string) {
  const res = await getUsers(apiRequest(`/api/admin/users${query}`, { cookie }));
  expect(res.status).toBe(200);
  return (await json<{ users: UserRow[] }>(res)).users;
}

const emailToken = (email: string) => email.split("@")[0]!.split("-").at(-1)!;

describe("admin routes are admin-only", () => {
  // Every admin route, called with the given cookie.
  const calls: [string, (cookie?: string) => Promise<Response>][] = [
    ["GET stats", (cookie) => getStats(apiRequest("/api/admin/stats", { cookie }))],
    ["GET disputes", (cookie) => getDisputes(apiRequest("/api/admin/disputes", { cookie }))],
    ["GET disputes/:id", (cookie) => getDispute(apiRequest("/api/admin/disputes/x", { cookie }), idParams("x"))],
    [
      "POST disputes/:id",
      (cookie) => postDispute(apiRequest("/api/admin/disputes/x", { cookie, json: { action: "resolve", note: "Closing" } }), idParams("x")),
    ],
    ["GET reports", (cookie) => getReports(apiRequest("/api/admin/reports", { cookie }))],
    ["POST reports/:id", (cookie) => postReport(apiRequest("/api/admin/reports/x", { cookie, json: { action: "dismiss" } }), idParams("x"))],
    ["GET users", (cookie) => getUsers(apiRequest("/api/admin/users", { cookie }))],
    ["POST users/:id", (cookie) => postUser(apiRequest("/api/admin/users/x", { cookie, json: { action: "suspend" } }), idParams("x"))],
    ["GET shops", (cookie) => getAdminShops(apiRequest("/api/admin/shops", { cookie }))],
  ];

  it("401 without a session, 403 for customers and shop owners, 403 ACCOUNT_SUSPENDED for a suspended admin", async () => {
    const customer = await sessionCookie(await createUser());
    const owner = await sessionCookie((await createShopOwner()).owner);
    const suspendedAdmin = await sessionCookie(await createUser({ role: "ADMIN", status: "SUSPENDED" }));
    for (const [name, call] of calls) {
      const anon = await call();
      expect(anon.status, name).toBe(401);
      for (const cookie of [customer, owner]) {
        const res = await call(cookie);
        expect(res.status, name).toBe(403);
        expect((await json(res)).error?.code, name).toBe("FORBIDDEN");
      }
      const res = await call(suspendedAdmin);
      expect(res.status, name).toBe(403);
      expect((await json(res)).error?.code, name).toBe("ACCOUNT_SUSPENDED");
      expect(sessionCookieFrom(res), name).toEqual({ value: "", maxAge: 0 });
    }
  });

  it("a warned admin still gets through", async () => {
    const { cookie } = await adminCookie();
    const warned = await sessionCookie(await createUser({ role: "ADMIN", status: "WARNED", warningMessage: "careful" }));
    expect((await getStats(apiRequest("/api/admin/stats", { cookie }))).status).toBe(200);
    expect((await getStats(apiRequest("/api/admin/stats", { cookie: warned }))).status).toBe(200);
  });
});

describe("shop reports a customer", () => {
  it("201: OPEN report about the order's customer; every non-suspended admin is notified", async () => {
    const { shop, customer, order, ownerCookie } = await setup();
    const admin = await createUser({ role: "ADMIN" });
    const suspendedAdmin = await createUser({ role: "ADMIN", status: "SUSPENDED" });

    const { res, body } = await fileReport(shop.id, order.id, ownerCookie, { reason: "NO_SHOW", description: "  Never picked up the order.  " });
    expect(res.status).toBe(201);
    expect(body.report).toMatchObject({ reason: "NO_SHOW", description: "Never picked up the order.", status: "OPEN", adminNote: null });

    const row = await prisma.customerReport.findUniqueOrThrow({ where: { id: body.report.id } });
    expect(row).toMatchObject({ shopId: shop.id, orderId: order.id, customerId: customer.id, status: "OPEN" });

    const adminNotes = await prisma.notification.findMany({ where: { userId: admin.id } });
    expect(adminNotes).toEqual([
      expect.objectContaining({ type: "REPORT", title: `Customer reported by ${shop.name}`, link: "/admin/reports" }),
    ]);
    expect(adminNotes[0]!.body).toContain(order.orderNumber);
    expect(await prisma.notification.count({ where: { userId: suspendedAdmin.id } })).toBe(0);
    // The customer is not told.
    expect(await prisma.notification.count({ where: { userId: customer.id, type: "REPORT" } })).toBe(0);
  });

  it("one open report per order: a second one is 409 ALREADY_REPORTED, allowed again once the first is closed", async () => {
    const { shop, order, ownerCookie } = await setup();
    const { cookie } = await adminCookie();
    const first = await fileReport(shop.id, order.id, ownerCookie, { reason: "MISBEHAVIOR", description: "Shouted at the staff." });
    expect(first.res.status).toBe(201);
    const again = await fileReport(shop.id, order.id, ownerCookie, { reason: "OTHER", description: "Also left a mess behind." });
    expect(again.res.status).toBe(409);
    expect(again.body.error?.code).toBe("ALREADY_REPORTED");

    await actOnReport(first.body.report.id, cookie, { action: "dismiss" });
    expect((await fileReport(shop.id, order.id, ownerCookie, { reason: "OTHER", description: "It happened again today." })).res.status).toBe(201);

    const listed = await getOrderReports(apiRequest(`/api/shops/${shop.id}/orders/${order.id}/report`, { cookie: ownerCookie }), {
      params: Promise.resolve({ shopId: shop.id, orderId: order.id }),
    });
    expect(listed.status).toBe(200);
    const { reports } = await json<{ reports: ReportRow[] }>(listed);
    expect(reports.map((r) => [r.reason, r.status])).toEqual([
      ["OTHER", "OPEN"],
      ["MISBEHAVIOR", "DISMISSED"],
    ]);
  });

  it("unpaid orders and other shops' orders are 404; a foreign shop id is 403; customers 403", async () => {
    const { shop, order, ownerCookie, customerCookie } = await setup();
    const body = { reason: "NO_SHOW", description: "Never picked up the order." };

    const unpaid = await createOrderWith({ customerId: order.customerId, shopId: shop.id, status: "PENDING_PAYMENT" });
    expect((await fileReport(shop.id, unpaid.id, ownerCookie, body)).res.status).toBe(404);
    const failed = await createOrderWith({ customerId: order.customerId, shopId: shop.id, status: "PAYMENT_FAILED" });
    expect((await fileReport(shop.id, failed.id, ownerCookie, body)).res.status).toBe(404);

    const other = await createShopOwner();
    const otherCookie = await sessionCookie(other.owner);
    expect((await fileReport(other.shop.id, order.id, otherCookie, body)).res.status).toBe(404);
    const foreign = await fileReport(shop.id, order.id, otherCookie, body);
    expect(foreign.res.status).toBe(403);
    expect(foreign.body.error?.code).toBe("FORBIDDEN");

    expect((await fileReport(shop.id, order.id, customerCookie, body)).res.status).toBe(403);
    expect((await fileReport(shop.id, order.id, await sessionCookie(await createUser({ role: "ADMIN" })), body)).res.status).toBe(403);
    expect((await fileReport(shop.id, order.id, "", body)).res.status).toBe(401);

    expect(await prisma.customerReport.count({ where: { orderId: { in: [order.id, unpaid.id, failed.id] } } })).toBe(0);
  });

  it("validates the body", async () => {
    const { shop, order, ownerCookie } = await setup();
    for (const bad of [
      {},
      { reason: "RUDE", description: "Was rude at the counter." },
      { reason: "NO_SHOW" },
      { reason: "NO_SHOW", description: "short" },
      { reason: "NO_SHOW", description: "x".repeat(1001) },
    ]) {
      const { res, body } = await fileReport(shop.id, order.id, ownerCookie, bad);
      expect(res.status, JSON.stringify(bad).slice(0, 60)).toBe(400);
      expect(body.error?.code).toBe("VALIDATION_ERROR");
    }
    expect(await prisma.customerReport.count({ where: { orderId: order.id } })).toBe(0);
  });
});

describe("admin acts on a report", () => {
  async function reported() {
    const s = await setup();
    const { body } = await fileReport(s.shop.id, s.order.id, s.ownerCookie, { reason: "NO_SHOW", description: "Never picked up the order." });
    return { ...s, reportId: body.report.id };
  }

  it("warn → WARNED with the message, ACCOUNT notification, report ACTIONED with the note", async () => {
    const { customer, reportId } = await reported();
    const { cookie } = await adminCookie();
    const { res, body } = await actOnReport(reportId, cookie, { action: "warn", message: "Please collect your orders.", note: "First strike" });
    expect(res.status).toBe(200);
    expect(body).toMatchObject({
      changed: true,
      report: { id: reportId, status: "ACTIONED", adminNote: "First strike", customer: { id: customer.id, status: "WARNED", warningMessage: "Please collect your orders." } },
    });
    expect(await prisma.user.findUniqueOrThrow({ where: { id: customer.id } })).toMatchObject({
      status: "WARNED",
      warningMessage: "Please collect your orders.",
    });
    const notes = await prisma.notification.findMany({ where: { userId: customer.id, type: "ACCOUNT" } });
    expect(notes).toHaveLength(1);
    expect(notes[0]!.body).toContain("Please collect your orders.");
  });

  it("suspend → SUSPENDED, ACTIONED; reinstate on the actioned report → ACTIVE, warning cleared", async () => {
    const { customer, reportId } = await reported();
    await prisma.user.update({ where: { id: customer.id }, data: { status: "WARNED", warningMessage: "Earlier warning" } });
    const { cookie } = await adminCookie();

    const suspended = await actOnReport(reportId, cookie, { action: "suspend" });
    expect(suspended.res.status).toBe(200);
    expect(suspended.body).toMatchObject({ changed: true, report: { status: "ACTIONED", adminNote: null, customer: { status: "SUSPENDED" } } });

    // Warning a suspended account makes no sense.
    const warn = await actOnReport(reportId, cookie, { action: "warn", message: "Another warning" });
    expect(warn.res.status).toBe(409);
    expect(warn.body.error?.code).toBe("ACCOUNT_SUSPENDED");

    const reinstated = await actOnReport(reportId, cookie, { action: "reinstate", note: "Apologised" });
    expect(reinstated.res.status).toBe(200);
    expect(reinstated.body).toMatchObject({
      changed: true,
      report: { status: "ACTIONED", adminNote: "Apologised", customer: { status: "ACTIVE", warningMessage: null } },
    });
    expect(await prisma.user.findUniqueOrThrow({ where: { id: customer.id } })).toMatchObject({ status: "ACTIVE", warningMessage: null });
    expect(await prisma.notification.count({ where: { userId: customer.id, type: "ACCOUNT" } })).toBe(1);

    // A dismiss after it was actioned is refused.
    const dismiss = await actOnReport(reportId, cookie, { action: "dismiss" });
    expect(dismiss.res.status).toBe(409);
    expect(dismiss.body.error?.code).toBe("REPORT_CLOSED");
  });

  it("dismiss closes an OPEN report; repeat → changed:false; account actions on a dismissed report → 409", async () => {
    const { customer, reportId } = await reported();
    const { cookie } = await adminCookie();
    const first = await actOnReport(reportId, cookie, { action: "dismiss", note: "Not enough detail" });
    expect(first.res.status).toBe(200);
    expect(first.body).toMatchObject({ changed: true, report: { status: "DISMISSED", adminNote: "Not enough detail" } });

    const again = await actOnReport(reportId, cookie, { action: "dismiss" });
    expect(again.res.status).toBe(200);
    expect(again.body).toMatchObject({ changed: false, report: { status: "DISMISSED", adminNote: "Not enough detail" } });

    for (const action of [{ action: "suspend" }, { action: "warn", message: "Too late now" }, { action: "reinstate" }]) {
      const res = await actOnReport(reportId, cookie, action);
      expect(res.res.status, action.action).toBe(409);
      expect(res.body.error?.code).toBe("REPORT_CLOSED");
    }
    expect((await prisma.user.findUniqueOrThrow({ where: { id: customer.id } })).status).toBe("ACTIVE");
  });

  it("unknown report → 404; invalid action → 400", async () => {
    const { reportId } = await reported();
    const { cookie } = await adminCookie();
    expect((await actOnReport("no-such-report", cookie, { action: "dismiss" })).res.status).toBe(404);
    for (const bad of [{ action: "ban" }, { action: "warn" }, { action: "warn", message: "hi" }, {}]) {
      const { res, body } = await actOnReport(reportId, cookie, bad);
      expect(res.status, JSON.stringify(bad)).toBe(400);
      expect(body.error?.code).toBe("VALIDATION_ERROR");
    }
  });

  it("GET reports filters by status (OPEN by default, or all)", async () => {
    const open = await reported();
    const dismissed = await reported();
    const actioned = await reported();
    const { cookie } = await adminCookie();
    await actOnReport(dismissed.reportId, cookie, { action: "dismiss" });
    await actOnReport(actioned.reportId, cookie, { action: "suspend" });
    const mine = [open.reportId, dismissed.reportId, actioned.reportId];
    const ids = async (query = "") => (await listReports(cookie, query)).map((r) => r.id).filter((id) => mine.includes(id));

    expect(await ids()).toEqual([open.reportId]);
    expect(await ids("?status=OPEN")).toEqual([open.reportId]);
    expect(await ids("?status=DISMISSED")).toEqual([dismissed.reportId]);
    expect(await ids("?status=ACTIONED")).toEqual([actioned.reportId]);
    expect((await ids("?status=all")).sort()).toEqual([...mine].sort());
    const row = (await listReports(cookie)).find((r) => r.id === open.reportId);
    expect(row?.customer).toMatchObject({ id: open.customer.id, status: "ACTIVE" });
    expect((await getReports(apiRequest("/api/admin/reports?status=bogus", { cookie }))).status).toBe(400);
  });
});

describe("admin acts on a user", () => {
  it("warn / suspend / reinstate a customer; repeats are no-ops", async () => {
    const customer = await createUser();
    const { cookie } = await adminCookie();

    const warned = await actOnUser(customer.id, cookie, { action: "warn", message: "Please be polite to staff." });
    expect(warned.res.status).toBe(200);
    expect(warned.body).toMatchObject({ changed: true, user: { id: customer.id, status: "WARNED", warningMessage: "Please be polite to staff." } });
    expect((await actOnUser(customer.id, cookie, { action: "warn", message: "Please be polite to staff." })).body.changed).toBe(false);

    const suspended = await actOnUser(customer.id, cookie, { action: "suspend" });
    expect(suspended.body).toMatchObject({ changed: true, user: { status: "SUSPENDED" } });
    const repeat = await actOnUser(customer.id, cookie, { action: "suspend" });
    expect(repeat.res.status).toBe(200);
    expect(repeat.body).toMatchObject({ changed: false, user: { status: "SUSPENDED" } });

    const warnSuspended = await actOnUser(customer.id, cookie, { action: "warn", message: "Another warning" });
    expect(warnSuspended.res.status).toBe(409);
    expect(warnSuspended.body.error?.code).toBe("ACCOUNT_SUSPENDED");

    const reinstated = await actOnUser(customer.id, cookie, { action: "reinstate" });
    expect(reinstated.body).toMatchObject({ changed: true, user: { status: "ACTIVE", warningMessage: null } });
    expect((await actOnUser(customer.id, cookie, { action: "reinstate" })).body.changed).toBe(false);

    const notes = await prisma.notification.findMany({ where: { userId: customer.id, type: "ACCOUNT" }, orderBy: { createdAt: "asc" } });
    expect(notes.map((n) => n.link)).toEqual(["/account", "/account"]);
    expect(notes[0]!.body).toContain("Please be polite to staff.");
  });

  it("suspending a shop owner hides the shop from customers until reinstated; the admin still sees it", async () => {
    const { owner, shop } = await createShopOwner();
    const { cookie } = await adminCookie();
    const customerCookie = await sessionCookie(await createUser());
    const browse = async () => {
      const res = await getShops(apiRequest(`/api/shops?q=${encodeURIComponent(shop.name)}`, { cookie: customerCookie }));
      return (await json<{ shops: { id: string }[] }>(res)).shops.map((s) => s.id);
    };
    const adminShops = async () => {
      const res = await getAdminShops(apiRequest(`/api/admin/shops?q=${encodeURIComponent(shop.name)}`, { cookie }));
      expect(res.status).toBe(200);
      return (await json<{ shops: { id: string; owner: { id: string; status: string } }[] }>(res)).shops;
    };
    expect(await browse()).toEqual([shop.id]);

    const warned = await actOnUser(owner.id, cookie, { action: "warn", message: "Keep the stall clean." });
    expect(warned.body.user).toMatchObject({ status: "WARNED" });
    expect(await prisma.notification.findFirst({ where: { userId: owner.id, type: "ACCOUNT" } })).toMatchObject({ link: "/shop" });
    expect(await browse()).toEqual([shop.id]);

    expect((await actOnUser(owner.id, cookie, { action: "suspend" })).body).toMatchObject({ changed: true, user: { status: "SUSPENDED" } });
    expect(await browse()).toEqual([]);
    expect(await adminShops()).toEqual([expect.objectContaining({ id: shop.id, owner: expect.objectContaining({ id: owner.id, status: "SUSPENDED" }) })]);

    expect((await actOnUser(owner.id, cookie, { action: "reinstate" })).body).toMatchObject({ changed: true, user: { status: "ACTIVE" } });
    expect(await browse()).toEqual([shop.id]);
  });

  it("admins cannot be targeted; unknown user 404; invalid bodies 400", async () => {
    const { admin, cookie } = await adminCookie();
    const other = await createUser({ role: "ADMIN" });
    for (const target of [admin.id, other.id]) {
      const { res, body } = await actOnUser(target, cookie, { action: "suspend" });
      expect(res.status).toBe(403);
      expect(body.error?.code).toBe("ADMIN_ACCOUNT");
    }
    expect((await prisma.user.findUniqueOrThrow({ where: { id: other.id } })).status).toBe("ACTIVE");
    expect((await actOnUser("no-such-user", cookie, { action: "suspend" })).res.status).toBe(404);

    const customer = await createUser();
    for (const bad of [{ action: "ban" }, { action: "warn" }, { action: "warn", message: "no" }, { action: "dismiss" }]) {
      const { res, body } = await actOnUser(customer.id, cookie, bad);
      expect(res.status, JSON.stringify(bad)).toBe(400);
      expect(body.error?.code).toBe("VALIDATION_ERROR");
    }
    expect((await prisma.user.findUniqueOrThrow({ where: { id: customer.id } })).status).toBe("ACTIVE");
  });

  it("GET users searches name / email case-insensitively and filters by role and status", async () => {
    const { cookie } = await adminCookie();
    const token = `zq${uid()}`;
    const customer = await createUser();
    const warned = await createUser({ status: "WARNED", warningMessage: "Be nice" });
    const { owner } = await createShopOwner();
    for (const u of [customer, warned, owner]) await prisma.user.update({ where: { id: u.id }, data: { name: `Person ${token}` } });
    const ids = (users: UserRow[]) => users.map((u) => u.id).sort();

    expect(ids(await listUsers(cookie, `?q=${token.toUpperCase()}`))).toEqual([customer.id, warned.id, owner.id].sort());
    expect(ids(await listUsers(cookie, `?q=${emailToken(customer.email).toUpperCase()}`))).toEqual([customer.id]);
    expect(ids(await listUsers(cookie, `?q=${token}&role=SHOP_OWNER`))).toEqual([owner.id]);
    expect(ids(await listUsers(cookie, `?q=${token}&role=CUSTOMER`))).toEqual([customer.id, warned.id].sort());
    expect(ids(await listUsers(cookie, `?q=${token}&status=WARNED`))).toEqual([warned.id]);
    expect(ids(await listUsers(cookie, `?q=${token}&role=CUSTOMER&status=SUSPENDED`))).toEqual([]);
    expect(ids(await listUsers(cookie, `?q=${token}&role=&status=`))).toHaveLength(3);
    expect((await getUsers(apiRequest("/api/admin/users?role=ROOT", { cookie }))).status).toBe(400);
  });
});

describe("suspension logs the user out on their next request", () => {
  it("the existing cookie gets 403 ACCOUNT_SUSPENDED and is cleared; after reinstating it works again", async () => {
    const customer = await createUser();
    const customerCookie = await sessionCookie(customer);
    const { cookie } = await adminCookie();
    expect((await getMyOrders(apiRequest("/api/orders", { cookie: customerCookie }))).status).toBe(200);

    await actOnUser(customer.id, cookie, { action: "suspend" });
    for (const res of [
      await getMyOrders(apiRequest("/api/orders", { cookie: customerCookie })),
      await getMe(apiRequest("/api/me", { cookie: customerCookie })),
    ]) {
      expect(res.status).toBe(403);
      expect((await json(res)).error?.code).toBe("ACCOUNT_SUSPENDED");
      expect(sessionCookieFrom(res)).toEqual({ value: "", maxAge: 0 });
    }

    await actOnUser(customer.id, cookie, { action: "reinstate" });
    const res = await getMe(apiRequest("/api/me", { cookie: customerCookie }));
    expect(res.status).toBe(200);
    expect(sessionCookieFrom(res)).toBeNull();
  });

  it("also for a suspended shop owner on a shop route", async () => {
    const { owner, shop } = await createShopOwner();
    const ownerCookie = await sessionCookie(owner);
    const { cookie } = await adminCookie();
    await actOnUser(owner.id, cookie, { action: "suspend" });
    const order = await createOrderWith({ customerId: (await createUser()).id, shopId: shop.id });
    const { res, body } = await fileReport(shop.id, order.id, ownerCookie, { reason: "NO_SHOW", description: "Never picked up the order." });
    expect(res.status).toBe(403);
    expect(body.error?.code).toBe("ACCOUNT_SUSPENDED");
    expect(sessionCookieFrom(res)).toEqual({ value: "", maxAge: 0 });
  });
});

describe("dashboard counts", () => {
  it("returns every count and they move with new rows", async () => {
    const { cookie } = await adminCookie();
    const read = async () => {
      const res = await getStats(apiRequest("/api/admin/stats", { cookie }));
      expect(res.status).toBe(200);
      return (await json<{ counts: Record<string, number> }>(res)).counts;
    };
    const before = await read();
    expect(Object.keys(before).sort()).toEqual(
      ["customers", "escalatedDisputes", "openDisputes", "openReports", "ordersToday", "shops", "suspended", "warned"].sort(),
    );
    for (const value of Object.values(before)) expect(Number.isInteger(value)).toBe(true);

    // +2 customers (one warned, one suspended), +1 shop, +1 paid order today, +1 open report.
    const { shop, order, ownerCookie } = await setup("PLACED_PAID");
    await createUser({ status: "WARNED", warningMessage: "Careful" });
    await createUser({ status: "SUSPENDED" });
    await fileReport(shop.id, order.id, ownerCookie, { reason: "OTHER", description: "Something odd happened." });
    // Unpaid orders are not counted.
    await createOrderWith({ customerId: order.customerId, shopId: shop.id, status: "PENDING_PAYMENT" });

    const after = await read();
    expect(after.customers).toBeGreaterThanOrEqual(before.customers! + 3);
    expect(after.shops).toBeGreaterThanOrEqual(before.shops! + 1);
    expect(after.warned).toBeGreaterThanOrEqual(before.warned! + 1);
    expect(after.suspended).toBeGreaterThanOrEqual(before.suspended! + 1);
    expect(after.ordersToday).toBeGreaterThanOrEqual(before.ordersToday! + 1);
    expect(after.openReports).toBeGreaterThanOrEqual(before.openReports! + 1);
    expect(after.openDisputes).toBeGreaterThanOrEqual(after.escalatedDisputes!);
  });
});
