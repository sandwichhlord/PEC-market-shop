// Owner A must never read or change shop B: requests on B's shop path are 403, and B's ids used on A's own shop
// path are 404. After every attempt, B's data must be exactly as before.
import { describe, expect, it } from "vitest";
import { PATCH as patchProfile } from "@/app/api/shops/[shopId]/route";
import { GET as getMenu, POST as createDish } from "@/app/api/shops/[shopId]/menu/route";
import { DELETE as deleteDish, PATCH as patchDish } from "@/app/api/shops/[shopId]/menu/[itemId]/route";
import { PATCH as patchStock } from "@/app/api/shops/[shopId]/menu/[itemId]/stock/route";
import { GET as listOrders } from "@/app/api/shops/[shopId]/orders/route";
import { GET as getOrder } from "@/app/api/shops/[shopId]/orders/[orderId]/route";
import { POST as postStatus } from "@/app/api/shops/[shopId]/orders/[orderId]/status/route";
import { prisma } from "@/server/db";
import { apiRequest, createDish as createDishRow, createOrderWith, createShopOwner, createUser, sessionCookie } from "../helpers/fixtures";

const shopCtx = (shopId: string) => ({ params: Promise.resolve({ shopId }) });
const itemCtx = (shopId: string, itemId: string) => ({ params: Promise.resolve({ shopId, itemId }) });
const orderCtx = (shopId: string, orderId: string) => ({ params: Promise.resolve({ shopId, orderId }) });

function dishForm(fields: Record<string, string>) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  return form;
}

async function setup() {
  const a = await createShopOwner();
  const b = await createShopOwner();
  const customer = await createUser();
  const dish = await createDishRow(b.shop.id);
  const unusedDish = await createDishRow(b.shop.id);
  const order = await createOrderWith({
    customerId: customer.id,
    shopId: b.shop.id,
    status: "PLACED_PAID",
    items: [{ menuItemId: dish.id, name: dish.name, quantity: 1, pricePaise: dish.pricePaise }],
  });
  const watched = [b.owner.id, customer.id];
  return { a, b, dish, unusedDish, order, watched, cookieA: await sessionCookie(a.owner) };
}

/** Everything about shop B that an attack could change. */
async function snapshotShop(shopId: string, watchedUserIds: string[]) {
  const [shop, dishes, orders, events, notifications] = await Promise.all([
    prisma.shop.findUniqueOrThrow({ where: { id: shopId } }),
    prisma.menuItem.findMany({ where: { shopId }, orderBy: { id: "asc" } }),
    prisma.order.findMany({ where: { shopId }, orderBy: { id: "asc" } }),
    prisma.orderEvent.findMany({ where: { order: { shopId } }, orderBy: { id: "asc" } }),
    prisma.notification.count({ where: { userId: { in: watchedUserIds } } }),
  ]);
  return { shop, dishes, orders, events, notifications };
}

type Attempt = (shopId: string, itemId: string, orderId: string, cookie: string) => Promise<Response>;

const ATTEMPTS: [string, Attempt][] = [
  ["GET menu", (s, _i, _o, cookie) => getMenu(apiRequest(`/api/shops/${s}/menu`, { cookie }), shopCtx(s))],
  [
    "POST menu",
    (s, _i, _o, cookie) =>
      createDish(
        apiRequest(`/api/shops/${s}/menu`, { cookie, form: dishForm({ name: "Intruder dish", pricePaise: "1000", prepTimeMinutes: "5" }) }),
        shopCtx(s),
      ),
  ],
  [
    "PATCH item",
    (s, i, _o, cookie) =>
      patchDish(apiRequest(`/api/shops/${s}/menu/${i}`, { method: "PATCH", cookie, form: dishForm({ name: "Hijacked", pricePaise: "100" }) }), itemCtx(s, i)),
  ],
  [
    "PATCH stock",
    (s, i, _o, cookie) =>
      patchStock(apiRequest(`/api/shops/${s}/menu/${i}/stock`, { method: "PATCH", cookie, json: { inStock: false } }), itemCtx(s, i)),
  ],
  ["DELETE item", (s, i, _o, cookie) => deleteDish(apiRequest(`/api/shops/${s}/menu/${i}`, { method: "DELETE", cookie }), itemCtx(s, i))],
  [
    "PATCH profile",
    (s, _i, _o, cookie) =>
      patchProfile(apiRequest(`/api/shops/${s}`, { method: "PATCH", cookie, json: { name: "Taken over", isOpen: false } }), shopCtx(s)),
  ],
  ["GET orders", (s, _i, _o, cookie) => listOrders(apiRequest(`/api/shops/${s}/orders?filter=active`, { cookie }), shopCtx(s))],
  ["GET order detail", (s, _i, o, cookie) => getOrder(apiRequest(`/api/shops/${s}/orders/${o}`, { cookie }), orderCtx(s, o))],
  [
    "POST status",
    (s, _i, o, cookie) => postStatus(apiRequest(`/api/shops/${s}/orders/${o}/status`, { cookie, json: { to: "PREPARING" } }), orderCtx(s, o)),
  ],
];

/** Attempts that address a specific dish or order (and so can be retargeted at B's ids on A's own path). */
const ID_ATTEMPTS = ATTEMPTS.filter(([name]) => ["PATCH item", "PATCH stock", "DELETE item", "GET order detail", "POST status"].includes(name));

describe("shop ownership", () => {
  it.each(ATTEMPTS)("owner A cannot %s on shop B (403, B unchanged)", async (_name, attempt) => {
    const { b, dish, order, watched, cookieA } = await setup();
    const before = await snapshotShop(b.shop.id, watched);
    const res = await attempt(b.shop.id, dish.id, order.id, cookieA);
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("FORBIDDEN");
    expect(await snapshotShop(b.shop.id, watched)).toEqual(before);
  });

  it.each(ID_ATTEMPTS)("owner A cannot %s with B's ids on A's own shop path (404, B unchanged)", async (_name, attempt) => {
    const { a, b, dish, order, watched, cookieA } = await setup();
    const before = await snapshotShop(b.shop.id, watched);
    const res = await attempt(a.shop.id, dish.id, order.id, cookieA);
    expect(res.status).toBe(404);
    expect(await snapshotShop(b.shop.id, watched)).toEqual(before);
  });

  it("owner A cannot delete B's never-ordered dish via A's own shop path (404)", async () => {
    const { a, b, unusedDish, cookieA } = await setup();
    const res = await deleteDish(
      apiRequest(`/api/shops/${a.shop.id}/menu/${unusedDish.id}`, { method: "DELETE", cookie: cookieA }),
      itemCtx(a.shop.id, unusedDish.id),
    );
    expect(res.status).toBe(404);
    expect(await prisma.menuItem.findUnique({ where: { id: unusedDish.id } })).toMatchObject({ shopId: b.shop.id, isArchived: false });
  });

  it.each(ATTEMPTS)("%s on an unknown shop id is 404", async (_name, attempt) => {
    const { dish, order, cookieA } = await setup();
    const res = await attempt("no-such-shop", dish.id, order.id, cookieA);
    expect(res.status).toBe(404);
  });
});
