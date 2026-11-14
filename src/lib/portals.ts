// Portal ↔ role mapping shared by the proxy, the API and the UI. Client-safe (no server imports).
import type { Role } from "@/generated/prisma/enums";

export type Portal = "customer" | "shop" | "admin";

export const PORTAL_ROLE: Record<Portal, Role> = {
  customer: "CUSTOMER",
  shop: "SHOP_OWNER",
  admin: "ADMIN",
};

export const ROLE_PORTAL: Record<Role, Portal> = {
  CUSTOMER: "customer",
  SHOP_OWNER: "shop",
  ADMIN: "admin",
};

/** Where each role lands after login. */
export const ROLE_HOME: Record<Role, string> = {
  CUSTOMER: "/shops",
  SHOP_OWNER: "/shop",
  ADMIN: "/admin",
};

export const PORTAL_LOGIN: Record<Portal, string> = {
  customer: "/login",
  shop: "/shop/login",
  admin: "/admin/login",
};

export const ROLE_LABEL: Record<Role, string> = {
  CUSTOMER: "customer",
  SHOP_OWNER: "shop owner",
  ADMIN: "admin",
};

/** Auth pages: public, but a signed-in user is sent to their home instead. */
export const AUTH_PATHS = ["/login", "/signup", "/shop/login", "/shop/signup", "/admin/login"] as const;

export function isAuthPath(pathname: string): boolean {
  return (AUTH_PATHS as readonly string[]).includes(pathname);
}

/** Which role a (non-API, non-auth) page path belongs to, or null for public pages. */
export function requiredRoleForPath(pathname: string): Role | null {
  if (pathname === "/" || isAuthPath(pathname)) return null;
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return "ADMIN";
  if (pathname === "/shop" || pathname.startsWith("/shop/")) return "SHOP_OWNER";
  // Everything else (/shops, /orders, /notifications, /account, /checkout, /pay/…) is the customer portal.
  return "CUSTOMER";
}

/** The login page that owns a protected path. */
export function loginPathFor(pathname: string): string {
  const role = requiredRoleForPath(pathname);
  return PORTAL_LOGIN[role ? ROLE_PORTAL[role] : "customer"];
}

/** Accepts only same-origin relative paths for post-login redirects (blocks `//evil.com` and absolute URLs). */
export function safeNextPath(next: string | null | undefined): string | null {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return null;
  return next;
}
