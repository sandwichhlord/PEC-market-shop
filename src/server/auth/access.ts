// Session-user loading and the order access rule, shared by the API guards (guards.ts) and the Socket.IO handshake
// (realtime/server.ts). Deliberately free of Next.js imports: server.ts loads it before Next has started.
import type { Role } from "@/generated/prisma/enums";
import { prisma } from "@/server/db";
import type { SessionClaims } from "./jwt";

export interface AuthUser {
  id: string;
  role: Role;
  name: string;
  email: string;
  phone: string | null;
  status: "ACTIVE" | "WARNED" | "SUSPENDED";
  warningMessage: string | null;
}

export const AUTH_USER_SELECT = {
  id: true,
  role: true,
  name: true,
  email: true,
  phone: true,
  status: true,
  warningMessage: true,
} as const;

/**
 * Loads the user behind verified session claims. Returns null when the user no longer exists or their role
 * changed since the token was issued (the token is then stale and treated as logged out).
 */
export async function loadSessionUser(claims: SessionClaims | null): Promise<AuthUser | null> {
  if (!claims) return null;
  const user = await prisma.user.findUnique({ where: { id: claims.userId }, select: AUTH_USER_SELECT });
  if (!user || user.role !== claims.role) return null;
  return user;
}

export type OrderAccess = "customer" | "shop" | "admin";

/** How `user` may see an order (its customer, its shop's owner, or an admin), or null if they may not. */
export function orderAccessFor(
  user: { id: string; role: Role },
  order: { customerId: string; shop: { ownerId: string } },
): OrderAccess | null {
  if (user.role === "ADMIN") return "admin";
  if (user.role === "CUSTOMER" && order.customerId === user.id) return "customer";
  if (user.role === "SHOP_OWNER" && order.shop.ownerId === user.id) return "shop";
  return null;
}
