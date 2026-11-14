// Role-gated page access: the proxy redirects by the role in the session token.
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import type { Role } from "@/generated/prisma/enums";
import { signSession } from "@/server/auth/jwt";
import { proxy } from "@/proxy";

async function visit(path: string, role?: Role, cookie?: string) {
  const headers = new Headers();
  if (role) headers.set("cookie", `pec_session=${await signSession({ userId: "u1", role })}`);
  else if (cookie) headers.set("cookie", cookie);
  const res = await proxy(new NextRequest(`http://localhost:3000${path}`, { headers }));
  const location = res.headers.get("location");
  return {
    passed: res.headers.get("x-middleware-next") === "1",
    redirect: location ? new URL(location).pathname + new URL(location).search : null,
    res,
  };
}

describe("proxy: anonymous visitors", () => {
  it.each(["/", "/login", "/signup", "/shop/login", "/shop/signup", "/admin/login"])("may open %s", async (path) => {
    expect((await visit(path)).passed).toBe(true);
  });

  it.each([
    ["/shops", "/login?next=%2Fshops"],
    ["/orders?tab=past", "/login?next=%2Forders%3Ftab%3Dpast"],
    ["/shop", "/shop/login?next=%2Fshop"],
    ["/shop/menu", "/shop/login?next=%2Fshop%2Fmenu"],
    ["/admin", "/admin/login?next=%2Fadmin"],
  ])("are sent from %s to %s", async (path, target) => {
    expect((await visit(path)).redirect).toBe(target);
  });
});

describe("proxy: role gating", () => {
  it.each([
    ["CUSTOMER", "/shop", "/shops"],
    ["CUSTOMER", "/shop/orders", "/shops"],
    ["CUSTOMER", "/admin", "/shops"],
    ["SHOP_OWNER", "/shops", "/shop"],
    ["SHOP_OWNER", "/orders", "/shop"],
    ["SHOP_OWNER", "/admin", "/shop"],
    ["ADMIN", "/shop", "/admin"],
    ["ADMIN", "/account", "/admin"],
  ] as const)("%s visiting %s is redirected to %s", async (role, path, target) => {
    expect((await visit(path, role)).redirect).toBe(target);
  });

  it.each([
    ["CUSTOMER", "/shops"],
    ["CUSTOMER", "/account"],
    ["SHOP_OWNER", "/shop"],
    ["SHOP_OWNER", "/shop/menu"],
    ["ADMIN", "/admin"],
  ] as const)("%s may open %s", async (role, path) => {
    expect((await visit(path, role)).passed).toBe(true);
  });

  it.each([
    ["CUSTOMER", "/", "/shops"],
    ["CUSTOMER", "/login", "/shops"],
    ["SHOP_OWNER", "/shop/login", "/shop"],
    ["ADMIN", "/admin/login", "/admin"],
    ["CUSTOMER", "/admin/login", "/shops"],
  ] as const)("signed-in %s visiting %s goes to %s", async (role, path, target) => {
    expect((await visit(path, role)).redirect).toBe(target);
  });
});

describe("proxy: bad cookies", () => {
  it("treats an invalid token as logged out and deletes it", async () => {
    const { redirect, res } = await visit("/shops", undefined, "pec_session=not-a-jwt");
    expect(redirect).toBe("/login?next=%2Fshops");
    expect(res.headers.getSetCookie().some((c) => c.startsWith("pec_session=;") || /pec_session=;|pec_session=$/.test(c.split(";")[0]!))).toBe(true);
  });

  it("lets an invalid token reach the public login page", async () => {
    expect((await visit("/login", undefined, "pec_session=not-a-jwt")).passed).toBe(true);
  });
});
