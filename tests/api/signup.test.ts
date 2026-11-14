import { readdir } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { POST as customerSignup } from "@/app/api/auth/signup/route";
import { POST as shopSignup } from "@/app/api/auth/shop-signup/route";
import { verifySession } from "@/server/auth/jwt";
import { verifyPassword } from "@/server/auth/password";
import { prisma } from "@/server/db";
import { JPEG_BYTES, apiRequest, imageFile, sessionCookieFrom, uniqueEmail } from "../helpers/fixtures";

const validCustomer = () => ({ name: "Aarav Test", email: uniqueEmail("signup"), password: "longenough1", phone: "98765 00001" });

function shopForm(overrides: Record<string, string | File | null> = {}): FormData {
  const fields: Record<string, string | File | null> = {
    name: "Owner Test",
    email: uniqueEmail("shopsignup"),
    password: "longenough1",
    phone: "",
    shopName: "Test Tea Stall",
    shopDescription: "Chai and snacks",
    location: "Stall 9, near SAC",
    ...overrides,
  };
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) if (v !== null) form.set(k, v);
  return form;
}

describe("POST /api/auth/signup (customer)", () => {
  it("creates a CUSTOMER with a hashed password and logs them in", async () => {
    const input = validCustomer();
    const res = await customerSignup(apiRequest("/api/auth/signup", { json: { ...input, email: input.email.toUpperCase() } }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.redirectTo).toBe("/shops");
    expect(body.user).toMatchObject({ role: "CUSTOMER", email: input.email, phone: "9876500001", status: "ACTIVE" });
    expect(body.user.passwordHash).toBeUndefined();

    const user = await prisma.user.findUniqueOrThrow({ where: { email: input.email } });
    expect(user.passwordHash).not.toBe(input.password);
    expect(await verifyPassword(input.password, user.passwordHash)).toBe(true);

    const cookie = sessionCookieFrom(res);
    expect(cookie?.maxAge).toBeGreaterThan(0);
    expect(await verifySession(cookie?.value)).toEqual({ userId: user.id, role: "CUSTOMER" });
    expect(res.headers.getSetCookie()[0]).toMatch(/HttpOnly/i);
    expect(res.headers.getSetCookie()[0]).toMatch(/SameSite=Lax/i);
  });

  it("rejects a duplicate email with 409", async () => {
    const input = validCustomer();
    expect((await customerSignup(apiRequest("/api/auth/signup", { json: input }))).status).toBe(201);
    const res = await customerSignup(apiRequest("/api/auth/signup", { json: { ...input, name: "Someone Else" } }));
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("EMAIL_TAKEN");
  });

  it("validates input with field errors", async () => {
    const res = await customerSignup(
      apiRequest("/api/auth/signup", { json: { name: "A", email: "not-an-email", password: "short", phone: "12" } }),
    );
    expect(res.status).toBe(400);
    const { error } = await res.json();
    expect(error.code).toBe("VALIDATION_ERROR");
    expect(Object.keys(error.fieldErrors).sort()).toEqual(["email", "name", "password", "phone"]);
    expect(sessionCookieFrom(res)).toBeNull();
  });

  it("rejects malformed JSON with 400", async () => {
    const req = new Request("http://localhost:3000/api/auth/signup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{nope",
    });
    expect((await customerSignup(req)).status).toBe(400);
  });

  it("ignores a role smuggled into the body", async () => {
    const input = { ...validCustomer(), role: "ADMIN" };
    const res = await customerSignup(apiRequest("/api/auth/signup", { json: input }));
    expect(res.status).toBe(201);
    expect((await prisma.user.findUniqueOrThrow({ where: { email: input.email } })).role).toBe("CUSTOMER");
  });
});

describe("POST /api/auth/shop-signup", () => {
  it("creates a SHOP_OWNER and their shop with the uploaded logo", async () => {
    const form = shopForm({ logo: imageFile(JPEG_BYTES, "logo.jpg", "image/jpeg") });
    const res = await shopSignup(apiRequest("/api/auth/shop-signup", { form }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.redirectTo).toBe("/shop");
    expect(body.user.role).toBe("SHOP_OWNER");

    const shop = await prisma.shop.findUniqueOrThrow({ where: { ownerId: body.user.id } });
    expect(shop).toMatchObject({ id: body.shopId, name: "Test Tea Stall", location: "Stall 9, near SAC", isOpen: true });
    expect(shop.description).toBe("Chai and snacks");
    expect(shop.logoUrl).toMatch(/^\/api\/uploads\/logos\/.+\.jpg$/);
    expect(await verifySession(sessionCookieFrom(res)?.value)).toEqual({ userId: body.user.id, role: "SHOP_OWNER" });
  });

  it("generates a placeholder SVG logo when none is uploaded", async () => {
    const res = await shopSignup(apiRequest("/api/auth/shop-signup", { form: shopForm() }));
    expect(res.status).toBe(201);
    const { user } = await res.json();
    const shop = await prisma.shop.findUniqueOrThrow({ where: { ownerId: user.id } });
    expect(shop.logoUrl).toMatch(/^\/api\/uploads\/logos\/.+\.svg$/);
  });

  it("rejects a non-image logo and creates nothing", async () => {
    const email = uniqueEmail("badlogo");
    const form = shopForm({ email, logo: new File(["<script>alert(1)</script>"], "logo.png", { type: "image/png" }) });
    const res = await shopSignup(apiRequest("/api/auth/shop-signup", { form }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatchObject({ code: "INVALID_IMAGE", field: "logo" });
    expect(await prisma.user.findUnique({ where: { email } })).toBeNull();
  });

  it("rejects a logo over 5 MB with 413", async () => {
    const big = new Uint8Array(5 * 1024 * 1024 + 1);
    big.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const res = await shopSignup(apiRequest("/api/auth/shop-signup", { form: shopForm({ logo: imageFile(big) }) }));
    expect(res.status).toBe(413);
  });

  it("requires shop name and location", async () => {
    const res = await shopSignup(apiRequest("/api/auth/shop-signup", { form: shopForm({ shopName: "", location: null }) }));
    expect(res.status).toBe(400);
    const { error } = await res.json();
    expect(error.fieldErrors.shopName).toBeDefined();
    expect(error.fieldErrors.location).toBeDefined();
  });

  it("rejects a duplicate email and removes the stored logo", async () => {
    const email = uniqueEmail("dupshop");
    expect((await shopSignup(apiRequest("/api/auth/shop-signup", { form: shopForm({ email }) }))).status).toBe(201);
    const logosDir = path.join(process.env.UPLOAD_DIR!, "logos");
    const before = (await readdir(logosDir)).length;
    // Race-free duplicate: the email check runs before the logo is stored, so nothing is written.
    const res = await shopSignup(apiRequest("/api/auth/shop-signup", { form: shopForm({ email, logo: imageFile() }) }));
    expect(res.status).toBe(409);
    expect((await readdir(logosDir)).length).toBe(before); // only this file writes to logos/
    expect(await prisma.shop.count({ where: { owner: { email } } })).toBe(1);
  });
});
