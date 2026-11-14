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
  });

  it.each([null, undefined, "", "https://evil.example", "//evil.example", "/\\evil.example", "orders"])("rejects %s", (v) => {
    expect(safeNextPath(v)).toBeNull();
  });
});
