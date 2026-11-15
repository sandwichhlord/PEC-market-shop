import { describe, expect, it } from "vitest";
import { POST as login } from "@/app/api/auth/login/route";
import { GET as logoutRedirect, POST as logout } from "@/app/api/auth/logout/route";
import { GET as me } from "@/app/api/me/route";
import { SignJWT } from "jose";
import { verifySession } from "@/server/auth/jwt";
import { prisma } from "@/server/db";
import { TEST_PASSWORD, apiRequest, createShopOwner, createUser, sessionCookie, sessionCookieFrom } from "../helpers/fixtures";

const loginAs = (email: string, portal: "customer" | "shop" | "admin", password = TEST_PASSWORD) =>
  login(apiRequest("/api/auth/login", { json: { email, password, portal } }));

describe("POST /api/auth/login", () => {
  it.each([
    ["CUSTOMER", "customer", "/shops"],
    ["SHOP_OWNER", "shop", "/shop"],
    ["ADMIN", "admin", "/admin"],
  ] as const)("logs a %s in through the %s portal", async (role, portal, home) => {
    const user = await createUser({ role });
    const res = await loginAs(user.email.toUpperCase(), portal);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ redirectTo: home, user: { id: user.id, role } });
    expect(await verifySession(sessionCookieFrom(res)?.value)).toEqual({ userId: user.id, role });
  });

  it("rejects a wrong password and an unknown email with the same 401", async () => {
    const user = await createUser();
    const wrong = await loginAs(user.email, "customer", "not-the-password");
    const unknown = await loginAs("nobody-here@test.pec", "customer");
    for (const res of [wrong, unknown]) {
      expect(res.status).toBe(401);
      expect((await res.json()).error).toMatchObject({ code: "INVALID_CREDENTIALS", message: "Incorrect email or password." });
      expect(sessionCookieFrom(res)).toBeNull();
    }
  });

  it.each([
    ["SHOP_OWNER", "customer", "This account is a shop owner account.", "/shop/login"],
    ["CUSTOMER", "shop", "This account is a customer account.", "/login"],
    ["ADMIN", "customer", "This account is an admin account.", "/admin/login"],
    ["CUSTOMER", "admin", "This account is a customer account.", "/login"],
  ] as const)("refuses a %s on the %s portal and points to the right one", async (role, portal, message, loginPath) => {
    const user = await createUser({ role });
    const res = await loginAs(user.email, portal);
    expect(res.status).toBe(403);
    expect((await res.json()).error).toEqual({ code: "WRONG_PORTAL", message, role, loginPath });
    expect(sessionCookieFrom(res)).toBeNull();
  });

  it("refuses a suspended account even with the right password", async () => {
    const user = await createUser({ status: "SUSPENDED" });
    const res = await loginAs(user.email, "customer");
    expect(res.status).toBe(403);
    const { error } = await res.json();
    expect(error.code).toBe("ACCOUNT_SUSPENDED");
    expect(error.message).toMatch(/suspended/i);
    expect(sessionCookieFrom(res)?.value).toBe("");
  });

  it("does not reveal suspension to someone without the password", async () => {
    const user = await createUser({ status: "SUSPENDED" });
    expect((await loginAs(user.email, "customer", "guess")).status).toBe(401);
  });

  it("lets a warned user in and returns the warning", async () => {
    const user = await createUser({ status: "WARNED", warningMessage: "Please collect orders on time." });
    const res = await loginAs(user.email, "customer");
    expect(res.status).toBe(200);
    expect((await res.json()).user).toMatchObject({ status: "WARNED", warningMessage: "Please collect orders on time." });
  });

  it("validates the portal", async () => {
    const res = await login(apiRequest("/api/auth/login", { json: { email: "a@b.co", password: "x", portal: "root" } }));
    expect(res.status).toBe(400);
  });
});

describe("GET /api/me", () => {
  it("returns 401 without a session", async () => {
    const res = await me(apiRequest("/api/me"));
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("UNAUTHENTICATED");
  });

  it("returns the customer profile", async () => {
    const user = await createUser();
    const res = await me(apiRequest("/api/me", { cookie: await sessionCookie(user) }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user).toEqual({
      id: user.id,
      role: "CUSTOMER",
      name: user.name,
      email: user.email,
      phone: null,
      status: "ACTIVE",
      warningMessage: null,
    });
    expect(body.shop).toBeNull();
  });

  it("includes the shop for a shop owner", async () => {
    const { owner, shop } = await createShopOwner();
    const res = await me(apiRequest("/api/me", { cookie: await sessionCookie(owner) }));
    expect((await res.json()).shop).toMatchObject({ id: shop.id, name: shop.name, isOpen: true });
  });

  it("rejects a tampered token and clears the cookie", async () => {
    const user = await createUser();
    const forged = await new SignJWT({ role: "ADMIN" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(user.id)
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode("some-other-secret-that-is-long-enough-123"));
    const res = await me(apiRequest("/api/me", { cookie: `pec_session=${forged}` }));
    expect(res.status).toBe(401);
    expect(sessionCookieFrom(res)?.value).toBe("");
  });

  it("rejects a token whose role no longer matches the account", async () => {
    const user = await createUser();
    const res = await me(apiRequest("/api/me", { cookie: await sessionCookie({ id: user.id, role: "ADMIN" }) }));
    expect(res.status).toBe(401);
  });

  it("logs a user out on their next request once they are suspended", async () => {
    const user = await createUser();
    const cookie = await sessionCookie(user);
    expect((await me(apiRequest("/api/me", { cookie }))).status).toBe(200);
    await prisma.user.update({ where: { id: user.id }, data: { status: "SUSPENDED" } });
    const res = await me(apiRequest("/api/me", { cookie }));
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe("ACCOUNT_SUSPENDED");
    expect(sessionCookieFrom(res)).toEqual({ value: "", maxAge: 0 });
  });
});

describe("logout", () => {
  it("POST clears the session cookie", async () => {
    const res = await logout();
    expect(res.status).toBe(200);
    expect(sessionCookieFrom(res)).toEqual({ value: "", maxAge: 0 });
  });

  it("GET clears the cookie and redirects to a same-origin login page", async () => {
    const res = await logoutRedirect(apiRequest("/api/auth/logout?to=%2Fshop%2Flogin&reason=suspended"));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("http://localhost:3000/shop/login?reason=suspended");
    expect(sessionCookieFrom(res)).toEqual({ value: "", maxAge: 0 });
  });

  it("GET never redirects off-site", async () => {
    for (const to of ["%2F%2Fevil.example%2Fx", "%2F%09%2Fevil.example", "%2F%5C%2Fevil.example", "https%3A%2F%2Fevil.example"]) {
      const res = await logoutRedirect(apiRequest(`/api/auth/logout?to=${to}&reason=hacked`));
      expect(res.headers.get("location"), to).toBe("http://localhost:3000/login");
    }
  });

  it("GET from another site redirects but keeps the session", async () => {
    const req = new Request("http://localhost:3000/api/auth/logout?to=%2Flogin", { headers: { "sec-fetch-site": "cross-site" } });
    const res = await logoutRedirect(req);
    expect(res.status).toBe(303);
    expect(sessionCookieFrom(res)).toBeNull();
  });
});
