import { describe, expect, it } from "vitest";
import { loginPathFor, requiredRoleForPath, safeNextPath } from "./portals";

describe("requiredRoleForPath", () => {
  it.each([
    ["/", null],
    ["/login", null],
    ["/shop/signup", null],
    ["/admin/login", null],
    ["/shops", "CUSTOMER"],
    ["/shops/abc", "CUSTOMER"],
    ["/orders", "CUSTOMER"],
    ["/shop", "SHOP_OWNER"],
    ["/shop/menu", "SHOP_OWNER"],
    ["/shopping", "CUSTOMER"],
    ["/admin", "ADMIN"],
    ["/admin/users", "ADMIN"],
    ["/administrator", "CUSTOMER"],
  ])("%s → %s", (path, role) => {
    expect(requiredRoleForPath(path)).toBe(role);
  });
});

describe("loginPathFor", () => {
  it("picks the portal login page", () => {
    expect(loginPathFor("/orders")).toBe("/login");
    expect(loginPathFor("/shop/menu")).toBe("/shop/login");
    expect(loginPathFor("/admin")).toBe("/admin/login");
  });
});

describe("safeNextPath", () => {
  it("keeps same-origin paths", () => {
    expect(safeNextPath("/orders?tab=past")).toBe("/orders?tab=past");
    expect(safeNextPath("/shop/orders/abc#top")).toBe("/shop/orders/abc#top");
    // Dot segments are resolved but can never leave the origin.
    expect(safeNextPath("/../../orders")).toBe("/orders");
  });

  it.each([
    null,
    undefined,
    "",
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "orders",
    // Browsers strip tabs/newlines and read "\" as "/", so these all mean "//evil.example".
    "/\t/evil.example",
    "/\n/evil.example",
    "/\r\n/evil.example",
    "/\\/evil.example",
  ])("rejects %j", (v) => {
    expect(safeNextPath(v)).toBeNull();
  });
});
