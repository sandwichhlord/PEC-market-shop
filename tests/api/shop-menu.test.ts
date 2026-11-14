import { describe, expect, it } from "vitest";
import { GET as getCustomerShop } from "@/app/api/shops/[shopId]/route";
import { GET as getMenu, POST as createDishRoute } from "@/app/api/shops/[shopId]/menu/route";
import { DELETE as deleteDish, PATCH as patchDish } from "@/app/api/shops/[shopId]/menu/[itemId]/route";
import { PATCH as patchStock } from "@/app/api/shops/[shopId]/menu/[itemId]/stock/route";
import { prisma } from "@/server/db";
import {
  JPEG_BYTES,
  apiRequest,
  createDish,
  createOrderWith,
  createShopOwner,
  createUser,
  imageFile,
  sessionCookie,
  uid,
} from "../helpers/fixtures";

interface Dish {
  id: string;
  name: string;
  description: string;
  photoUrl: string | null;
  pricePaise: number;
  prepTimeMinutes: number;
  inStock: boolean;
}

const shopCtx = (shopId: string) => ({ params: Promise.resolve({ shopId }) });
const itemCtx = (shopId: string, itemId: string) => ({ params: Promise.resolve({ shopId, itemId }) });

function dishForm(fields: Record<string, string>, photo?: File | string) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  if (photo !== undefined) form.set("photo", photo);
  return form;
}

async function ownerSetup() {
  const { owner, shop } = await createShopOwner();
  return { owner, shop, cookie: await sessionCookie(owner) };
}

async function create(shopId: string, cookie: string | undefined, form: FormData) {
  const res = await createDishRoute(apiRequest(`/api/shops/${shopId}/menu`, { cookie, form }), shopCtx(shopId));
  return { res, body: (await res.json()) as { dish: Dish; error?: { code: string; fieldErrors?: Record<string, string[]> } } };
}

async function list(shopId: string, cookie: string | undefined) {
  const res = await getMenu(apiRequest(`/api/shops/${shopId}/menu`, { cookie }), shopCtx(shopId));
  return { res, body: (await res.json()) as { dishes: Dish[] } };
}

async function patch(shopId: string, itemId: string, cookie: string, form: FormData) {
  const res = await patchDish(
    apiRequest(`/api/shops/${shopId}/menu/${itemId}`, { method: "PATCH", cookie, form }),
    itemCtx(shopId, itemId),
  );
  return { res, body: (await res.json()) as { dish: Dish } };
}

async function stock(shopId: string, itemId: string, cookie: string, json: unknown) {
  const res = await patchStock(
    apiRequest(`/api/shops/${shopId}/menu/${itemId}/stock`, { method: "PATCH", cookie, json }),
    itemCtx(shopId, itemId),
  );
  return { res, body: (await res.json()) as { dish: Dish } };
}

async function remove(shopId: string, itemId: string, cookie: string) {
  const res = await deleteDish(apiRequest(`/api/shops/${shopId}/menu/${itemId}`, { method: "DELETE", cookie }), itemCtx(shopId, itemId));
  return { res, body: (await res.json()) as { result: string } };
}

const validFields = () => ({ name: `Samosa ${uid()}`, description: "Crispy", pricePaise: "2500", prepTimeMinutes: "10" });

describe("POST /api/shops/:shopId/menu", () => {
  it("creates a dish without a photo", async () => {
    const { shop, cookie } = await ownerSetup();
    const fields = validFields();
    const { res, body } = await create(shop.id, cookie, dishForm(fields));
    expect(res.status).toBe(201);
    expect(body.dish).toMatchObject({
      name: fields.name,
      description: "Crispy",
      pricePaise: 2500,
      prepTimeMinutes: 10,
      inStock: true,
      photoUrl: null,
    });
    const row = await prisma.menuItem.findUniqueOrThrow({ where: { id: body.dish.id } });
    expect(row).toMatchObject({ shopId: shop.id, name: fields.name, pricePaise: 2500, isArchived: false });
  });

  it("creates a dish with a PNG photo and stores its URL", async () => {
    const { shop, cookie } = await ownerSetup();
    const { res, body } = await create(shop.id, cookie, dishForm({ ...validFields(), inStock: "false" }, imageFile()));
    expect(res.status).toBe(201);
    expect(body.dish.photoUrl).toMatch(/^\/api\/uploads\/menu\/.+\.png$/);
    expect(body.dish.inStock).toBe(false);
    expect((await prisma.menuItem.findUniqueOrThrow({ where: { id: body.dish.id } })).photoUrl).toBe(body.dish.photoUrl);
  });

  it.each([
    ["name too short", { name: "A" }, "name"],
    ["price below ₹1", { pricePaise: "99" }, "pricePaise"],
    ["non-integer price", { pricePaise: "12.5" }, "pricePaise"],
    ["non-numeric price", { pricePaise: "abc" }, "pricePaise"],
    ["prep time 0", { prepTimeMinutes: "0" }, "prepTimeMinutes"],
    ["prep time over 180", { prepTimeMinutes: "181" }, "prepTimeMinutes"],
  ])("rejects %s with 400 VALIDATION_ERROR and creates nothing", async (_label, override, field) => {
    const { shop, cookie } = await ownerSetup();
    const { res, body } = await create(shop.id, cookie, dishForm({ ...validFields(), ...override }));
    expect(res.status).toBe(400);
    expect(body.error?.code).toBe("VALIDATION_ERROR");
    expect(body.error?.fieldErrors?.[field]?.length).toBeGreaterThan(0);
    expect(await prisma.menuItem.count({ where: { shopId: shop.id } })).toBe(0);
  });

  it("rejects a photo that is not an image", async () => {
    const { shop, cookie } = await ownerSetup();
    const fake = imageFile(new TextEncoder().encode("not an image at all"), "dish.png", "image/png");
    const { res, body } = await create(shop.id, cookie, dishForm(validFields(), fake));
    expect(res.status).toBe(400);
    expect(body.error?.code).toBe("INVALID_IMAGE");
    expect(await prisma.menuItem.count({ where: { shopId: shop.id } })).toBe(0);
  });

  it("requires a session (401) and the shop-owner role (403 for customers)", async () => {
    const { shop } = await ownerSetup();
    expect((await create(shop.id, undefined, dishForm(validFields()))).res.status).toBe(401);
    const customerCookie = await sessionCookie(await createUser());
    expect((await create(shop.id, customerCookie, dishForm(validFields()))).res.status).toBe(403);
    expect(await prisma.menuItem.count({ where: { shopId: shop.id } })).toBe(0);
  });
});

describe("GET /api/shops/:shopId/menu", () => {
  it("lists the owner's live dishes, oldest first", async () => {
    const { shop, cookie } = await ownerSetup();
    const first = await createDish(shop.id, { name: "First" });
    const second = await createDish(shop.id, { name: "Second" });
    await prisma.menuItem.create({ data: { shopId: shop.id, name: "Archived", pricePaise: 100, prepTimeMinutes: 1, isArchived: true } });
    const { res, body } = await list(shop.id, cookie);
    expect(res.status).toBe(200);
    expect(body.dishes.map((d) => d.id)).toEqual([first.id, second.id]);
  });

  it("401 without a session, 403 for a customer", async () => {
    const { shop } = await ownerSetup();
    expect((await list(shop.id, undefined)).res.status).toBe(401);
    expect((await list(shop.id, await sessionCookie(await createUser()))).res.status).toBe(403);
  });
});

describe("PATCH /api/shops/:shopId/menu/:itemId", () => {
  it("changes only the fields sent", async () => {
    const { shop, cookie } = await ownerSetup();
    const { body: created } = await create(shop.id, cookie, dishForm(validFields(), imageFile()));
    const before = created.dish;

    const { res, body } = await patch(shop.id, before.id, cookie, dishForm({ pricePaise: "3000" }));
    expect(res.status).toBe(200);
    expect(body.dish).toEqual({ ...before, pricePaise: 3000 });

    const { body: renamed } = await patch(shop.id, before.id, cookie, dishForm({ name: "Paneer roll", prepTimeMinutes: "15" }));
    expect(renamed.dish).toEqual({ ...before, pricePaise: 3000, name: "Paneer roll", prepTimeMinutes: 15 });
    expect(await prisma.menuItem.findUniqueOrThrow({ where: { id: before.id } })).toMatchObject({
      name: "Paneer roll",
      description: before.description,
      pricePaise: 3000,
      prepTimeMinutes: 15,
      photoUrl: before.photoUrl,
    });
  });

  it("replaces the photo URL when a new photo is uploaded", async () => {
    const { shop, cookie } = await ownerSetup();
    const { body: created } = await create(shop.id, cookie, dishForm(validFields(), imageFile()));
    const { res, body } = await patch(shop.id, created.dish.id, cookie, dishForm({}, imageFile(JPEG_BYTES, "new.jpg", "image/jpeg")));
    expect(res.status).toBe(200);
    expect(body.dish.photoUrl).toMatch(/^\/api\/uploads\/menu\/.+\.jpg$/);
    expect(body.dish.photoUrl).not.toBe(created.dish.photoUrl);
    expect(body.dish.name).toBe(created.dish.name);
  });

  it("rejects invalid values without changing the dish", async () => {
    const { shop, cookie } = await ownerSetup();
    const dish = await createDish(shop.id);
    const { res } = await patch(shop.id, dish.id, cookie, dishForm({ name: "Ok name", pricePaise: "50" }));
    expect(res.status).toBe(400);
    expect(await prisma.menuItem.findUniqueOrThrow({ where: { id: dish.id } })).toMatchObject({ name: dish.name, pricePaise: dish.pricePaise });
  });

  it("404s an unknown dish", async () => {
    const { shop, cookie } = await ownerSetup();
    expect((await patch(shop.id, "no-such-dish", cookie, dishForm({ name: "Whatever" }))).res.status).toBe(404);
  });
});

describe("PATCH /api/shops/:shopId/menu/:itemId/stock", () => {
  it("toggles stock off and back on", async () => {
    const { shop, cookie } = await ownerSetup();
    const dish = await createDish(shop.id);

    const off = await stock(shop.id, dish.id, cookie, { inStock: false });
    expect(off.res.status).toBe(200);
    expect(off.body.dish.inStock).toBe(false);
    expect((await prisma.menuItem.findUniqueOrThrow({ where: { id: dish.id } })).inStock).toBe(false);

    const on = await stock(shop.id, dish.id, cookie, { inStock: true });
    expect(on.res.status).toBe(200);
    expect(on.body.dish.inStock).toBe(true);
    expect((await prisma.menuItem.findUniqueOrThrow({ where: { id: dish.id } })).inStock).toBe(true);
  });

  it("rejects a non-boolean inStock", async () => {
    const { shop, cookie } = await ownerSetup();
    const dish = await createDish(shop.id);
    expect((await stock(shop.id, dish.id, cookie, { inStock: "false" })).res.status).toBe(400);
    expect((await prisma.menuItem.findUniqueOrThrow({ where: { id: dish.id } })).inStock).toBe(true);
  });
});

describe("DELETE /api/shops/:shopId/menu/:itemId", () => {
  it("deletes a dish that was never ordered", async () => {
    const { shop, cookie } = await ownerSetup();
    const dish = await createDish(shop.id);
    const { res, body } = await remove(shop.id, dish.id, cookie);
    expect(res.status).toBe(200);
    expect(body).toEqual({ result: "deleted" });
    expect(await prisma.menuItem.findUnique({ where: { id: dish.id } })).toBeNull();
  });

  it("archives a dish referenced by an order and hides it everywhere", async () => {
    const { shop, cookie } = await ownerSetup();
    const customer = await createUser();
    const dish = await createDish(shop.id);
    const kept = await createDish(shop.id);
    await createOrderWith({
      customerId: customer.id,
      shopId: shop.id,
      status: "COMPLETED",
      items: [{ menuItemId: dish.id, name: dish.name, quantity: 1, pricePaise: dish.pricePaise }],
    });

    const { res, body } = await remove(shop.id, dish.id, cookie);
    expect(res.status).toBe(200);
    expect(body).toEqual({ result: "archived" });
    expect((await prisma.menuItem.findUniqueOrThrow({ where: { id: dish.id } })).isArchived).toBe(true);

    // Hidden from the owner's menu and from customers.
    expect((await list(shop.id, cookie)).body.dishes.map((d) => d.id)).toEqual([kept.id]);
    const customerRes = await getCustomerShop(
      apiRequest(`/api/shops/${shop.id}`, { cookie: await sessionCookie(customer) }),
      shopCtx(shop.id),
    );
    const { shop: customerView } = (await customerRes.json()) as { shop: { menuItems: { id: string }[] } };
    expect(customerView.menuItems.map((d) => d.id)).toEqual([kept.id]);

    // The archived dish can no longer be edited, toggled or deleted.
    expect((await patch(shop.id, dish.id, cookie, dishForm({ name: "Revived" }))).res.status).toBe(404);
    expect((await stock(shop.id, dish.id, cookie, { inStock: false })).res.status).toBe(404);
    expect((await remove(shop.id, dish.id, cookie)).res.status).toBe(404);
    expect(await prisma.menuItem.findUniqueOrThrow({ where: { id: dish.id } })).toMatchObject({
      name: dish.name,
      inStock: true,
      isArchived: true,
    });
  });

  it("401 without a session, 403 for a customer", async () => {
    const { shop } = await ownerSetup();
    const dish = await createDish(shop.id);
    const anon = await deleteDish(apiRequest(`/api/shops/${shop.id}/menu/${dish.id}`, { method: "DELETE" }), itemCtx(shop.id, dish.id));
    expect(anon.status).toBe(401);
    expect((await remove(shop.id, dish.id, await sessionCookie(await createUser()))).res.status).toBe(403);
    expect(await prisma.menuItem.findUnique({ where: { id: dish.id } })).not.toBeNull();
  });
});
