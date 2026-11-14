import { describe, expect, it } from "vitest";
import { GET as getShop, PATCH as patchShop } from "@/app/api/shops/[shopId]/route";
import { prisma } from "@/server/db";
import { apiRequest, createShopOwner, createUser, imageFile, sessionCookie, uid } from "../helpers/fixtures";

interface Profile {
  id: string;
  name: string;
  description: string;
  location: string;
  logoUrl: string | null;
  isOpen: boolean;
}

const shopCtx = (shopId: string) => ({ params: Promise.resolve({ shopId }) });

async function ownerSetup() {
  const { owner, shop } = await createShopOwner();
  return { owner, shop, cookie: await sessionCookie(owner) };
}

function form(fields: Record<string, string>, logo?: File) {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  if (logo) f.set("logo", logo);
  return f;
}

async function patch(shopId: string, cookie: string | undefined, body: { form?: FormData; json?: unknown }) {
  const res = await patchShop(apiRequest(`/api/shops/${shopId}`, { method: "PATCH", cookie, ...body }), shopCtx(shopId));
  return { res, body: (await res.json()) as { shop: Profile; error?: { code: string; fieldErrors?: Record<string, string[]> } } };
}

async function customerView(shopId: string) {
  const res = await getShop(apiRequest(`/api/shops/${shopId}`, { cookie: await sessionCookie(await createUser()) }), shopCtx(shopId));
  expect(res.status).toBe(200);
  return ((await res.json()) as { shop: Profile }).shop;
}

const profileRow = (id: string) =>
  prisma.shop.findUniqueOrThrow({ where: { id }, select: { name: true, description: true, location: true, logoUrl: true, isOpen: true } });

describe("PATCH /api/shops/:shopId (profile)", () => {
  it("updates name, description and location from multipart", async () => {
    const { shop, cookie } = await ownerSetup();
    const name = `Chai Point ${uid()}`;
    const { res, body } = await patch(shop.id, cookie, {
      form: form({ name, description: "Hot tea all day", location: "Near the library" }),
    });
    expect(res.status).toBe(200);
    expect(body.shop).toMatchObject({ id: shop.id, name, description: "Hot tea all day", location: "Near the library" });
    expect(await profileRow(shop.id)).toMatchObject({ name, description: "Hot tea all day", location: "Near the library" });
  });

  it("partial updates leave the other fields alone", async () => {
    const { shop, cookie } = await ownerSetup();
    const before = await profileRow(shop.id);
    const { res } = await patch(shop.id, cookie, { form: form({ description: "Only this changes" }) });
    expect(res.status).toBe(200);
    expect(await profileRow(shop.id)).toEqual({ ...before, description: "Only this changes" });

    const { res: jsonRes } = await patch(shop.id, cookie, { json: { location: "Block C" } });
    expect(jsonRes.status).toBe(200);
    expect(await profileRow(shop.id)).toEqual({ ...before, description: "Only this changes", location: "Block C" });
  });

  it("uploads a logo and replaces logoUrl", async () => {
    const { shop, cookie } = await ownerSetup();
    const before = await profileRow(shop.id);
    const first = await patch(shop.id, cookie, { form: form({}, imageFile()) });
    expect(first.res.status).toBe(200);
    expect(first.body.shop.logoUrl).toMatch(/^\/api\/uploads\/logos\/.+\.png$/);
    expect(await profileRow(shop.id)).toEqual({ ...before, logoUrl: first.body.shop.logoUrl });

    const second = await patch(shop.id, cookie, { form: form({}, imageFile()) });
    expect(second.body.shop.logoUrl).toMatch(/^\/api\/uploads\/logos\/.+\.png$/);
    expect(second.body.shop.logoUrl).not.toBe(first.body.shop.logoUrl);
  });

  it("rejects a logo that is not an image and changes nothing", async () => {
    const { shop, cookie } = await ownerSetup();
    const before = await profileRow(shop.id);
    const bogus = imageFile(new TextEncoder().encode("GIF? no, plain text"), "logo.png", "image/png");
    const { res, body } = await patch(shop.id, cookie, { form: form({ name: "New name" }, bogus) });
    expect(res.status).toBe(400);
    expect(body.error?.code).toBe("INVALID_IMAGE");
    expect(await profileRow(shop.id)).toEqual(before);
  });

  it("toggles open/closed via JSON, visible to customers", async () => {
    const { shop, cookie } = await ownerSetup();
    const closed = await patch(shop.id, cookie, { json: { isOpen: false } });
    expect(closed.res.status).toBe(200);
    expect(closed.body.shop.isOpen).toBe(false);
    expect((await customerView(shop.id)).isOpen).toBe(false);

    const opened = await patch(shop.id, cookie, { json: { isOpen: true } });
    expect(opened.res.status).toBe(200);
    expect(opened.body.shop.isOpen).toBe(true);
    expect((await customerView(shop.id)).isOpen).toBe(true);
  });

  it.each([
    ["multipart name too short", { form: form({ name: "X" }) }, "name"],
    ["JSON name too short", { json: { name: " A " } }, "name"],
    ["location too short", { json: { location: "x" } }, "location"],
    ["description too long", { json: { description: "d".repeat(501) } }, "description"],
    ["non-boolean isOpen", { json: { isOpen: "maybe" } }, "isOpen"],
  ])("rejects %s with 400 VALIDATION_ERROR", async (_label, body, field) => {
    const { shop, cookie } = await ownerSetup();
    const before = await profileRow(shop.id);
    const { res, body: resBody } = await patch(shop.id, cookie, body);
    expect(res.status).toBe(400);
    expect(resBody.error?.code).toBe("VALIDATION_ERROR");
    expect(resBody.error?.fieldErrors?.[field]?.length).toBeGreaterThan(0);
    expect(await profileRow(shop.id)).toEqual(before);
  });

  it("401 without a session, 403 for a customer", async () => {
    const { shop } = await ownerSetup();
    const before = await profileRow(shop.id);
    expect((await patch(shop.id, undefined, { json: { isOpen: false } })).res.status).toBe(401);
    expect((await patch(shop.id, await sessionCookie(await createUser()), { json: { isOpen: false } })).res.status).toBe(403);
    expect(await profileRow(shop.id)).toEqual(before);
  });
});
