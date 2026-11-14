import { describe, expect, it } from "vitest";
import { GET as getShop } from "@/app/api/shops/[shopId]/route";
import { GET as listShops } from "@/app/api/shops/route";
import { prisma } from "@/server/db";
import { apiRequest, createOrder, createShopOwner, createUser, sessionCookie, uid } from "../helpers/fixtures";

interface ShopRow {
  id: string;
  name: string;
  isOpen: boolean;
  rating: { average: number | null; count: number };
}

async function customerCookie() {
  return sessionCookie(await createUser());
}

async function list(cookie: string | undefined, q?: string) {
  const res = await listShops(apiRequest(`/api/shops${q === undefined ? "" : `?q=${encodeURIComponent(q)}`}`, { cookie }));
  return { res, body: (await res.json()) as { shops: ShopRow[] } };
}

const shopCtx = (shopId: string) => ({ params: Promise.resolve({ shopId }) });

async function addReview(customerId: string, shopId: string, rating: number) {
  const order = await createOrder(customerId, shopId);
  await prisma.order.update({ where: { id: order.id }, data: { status: "COMPLETED" } });
  await prisma.review.create({ data: { orderId: order.id, customerId, shopId, rating } });
}

describe("GET /api/shops", () => {
  it("requires a signed-in user", async () => {
    const { res } = await list(undefined);
    expect(res.status).toBe(401);
  });

  it("lists shops with open/closed state, open ones first", async () => {
    const tag = uid();
    const { shop: closed } = await createShopOwner();
    const { shop: open } = await createShopOwner();
    await prisma.shop.update({ where: { id: closed.id }, data: { name: `Aaa closed ${tag}`, isOpen: false } });
    await prisma.shop.update({ where: { id: open.id }, data: { name: `Zzz open ${tag}`, isOpen: true } });

    const { res, body } = await list(await customerCookie(), tag);
    expect(res.status).toBe(200);
    expect(body.shops.map((s) => [s.id, s.isOpen])).toEqual([
      [open.id, true],
      [closed.id, false],
    ]);
  });

  it("searches by name, case-insensitively", async () => {
    const tag = uid();
    const { shop } = await createShopOwner();
    await prisma.shop.update({ where: { id: shop.id }, data: { name: `Masala Magic ${tag}` } });
    const cookie = await customerCookie();

    expect((await list(cookie, `masala magic ${tag}`.toUpperCase())).body.shops.map((s) => s.id)).toEqual([shop.id]);
    expect((await list(cookie, `nothing-${tag}`)).body.shops).toEqual([]);
    // Blank search = no filter.
    expect((await list(cookie, "   ")).body.shops.some((s) => s.id === shop.id)).toBe(true);
  });

  it("rejects an over-long search", async () => {
    const { res, body } = await list(await customerCookie(), "x".repeat(81));
    expect(res.status).toBe(400);
    expect((body as unknown as { error: { code: string } }).error.code).toBe("VALIDATION_ERROR");
  });

  it("reports average rating (1 decimal) and review count, null when unreviewed", async () => {
    const tag = uid();
    const { shop: rated } = await createShopOwner();
    const { shop: unrated } = await createShopOwner();
    await prisma.shop.update({ where: { id: rated.id }, data: { name: `Rated ${tag}` } });
    await prisma.shop.update({ where: { id: unrated.id }, data: { name: `Unrated ${tag}` } });
    const customer = await createUser();
    for (const stars of [5, 4, 4]) await addReview(customer.id, rated.id, stars);

    const { body } = await list(await customerCookie(), tag);
    const byId = new Map(body.shops.map((s) => [s.id, s]));
    expect(byId.get(rated.id)?.rating).toEqual({ average: 4.3, count: 3 });
    expect(byId.get(unrated.id)?.rating).toEqual({ average: null, count: 0 });
  });

  it("hides shops whose owner is suspended", async () => {
    const tag = uid();
    const { owner, shop } = await createShopOwner();
    await prisma.shop.update({ where: { id: shop.id }, data: { name: `Hidden ${tag}` } });
    await prisma.user.update({ where: { id: owner.id }, data: { status: "SUSPENDED" } });
    expect((await list(await customerCookie(), tag)).body.shops).toEqual([]);
  });
});

describe("GET /api/shops/:shopId", () => {
  it("returns the shop with its non-archived menu, including out-of-stock dishes", async () => {
    const { shop } = await createShopOwner();
    await prisma.menuItem.createMany({
      data: [
        { shopId: shop.id, name: "Chai", pricePaise: 1500, prepTimeMinutes: 3 },
        { shopId: shop.id, name: "Kachori", pricePaise: 2500, prepTimeMinutes: 5, inStock: false },
        { shopId: shop.id, name: "Old dish", pricePaise: 1000, prepTimeMinutes: 5, isArchived: true },
      ],
    });
    const res = await getShop(apiRequest(`/api/shops/${shop.id}`, { cookie: await customerCookie() }), shopCtx(shop.id));
    expect(res.status).toBe(200);
    const { shop: body } = (await res.json()) as {
      shop: ShopRow & { menuItems: { name: string; inStock: boolean; pricePaise: number; prepTimeMinutes: number }[] };
    };
    expect(body.id).toBe(shop.id);
    expect(body.rating).toEqual({ average: null, count: 0 });
    expect(body.menuItems.map((d) => [d.name, d.inStock]).sort()).toEqual([
      ["Chai", true],
      ["Kachori", false],
    ]);
    expect(body.menuItems.find((d) => d.name === "Chai")).toMatchObject({ pricePaise: 1500, prepTimeMinutes: 3 });
  });

  it("requires a signed-in user", async () => {
    const { shop } = await createShopOwner();
    expect((await getShop(apiRequest(`/api/shops/${shop.id}`), shopCtx(shop.id))).status).toBe(401);
  });

  it("404s an unknown shop and a shop whose owner is suspended", async () => {
    const cookie = await customerCookie();
    expect((await getShop(apiRequest("/api/shops/nope", { cookie }), shopCtx("nope"))).status).toBe(404);

    const { owner, shop } = await createShopOwner();
    await prisma.user.update({ where: { id: owner.id }, data: { status: "SUSPENDED" } });
    expect((await getShop(apiRequest(`/api/shops/${shop.id}`, { cookie }), shopCtx(shop.id))).status).toBe(404);
  });
});
