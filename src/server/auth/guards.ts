// Authorization for API routes. Every route handler calls one of these (or documents why it is public).
// Guards take the Request so they work identically in route handlers and in API-level tests.
import type { Role } from "@/generated/prisma/enums";
import { SUSPENDED_MESSAGE } from "@/lib/account";
import { prisma } from "@/server/db";
import { HttpError, forbidden, notFound } from "@/server/http";
import { loadSessionUser, orderAccessFor, type AuthUser } from "./access";
import { verifySession } from "./jwt";
import { sessionTokenFromRequest } from "./session";

export { AUTH_USER_SELECT, loadSessionUser, orderAccessFor, type AuthUser, type OrderAccess } from "./access";

export function suspendedError(): HttpError {
  return new HttpError(403, "ACCOUNT_SUSPENDED", SUSPENDED_MESSAGE, { clearSession: true });
}

/** The signed-in, non-suspended user. 401 without a valid session; 403 ACCOUNT_SUSPENDED (cookie cleared) if suspended. */
export async function requireUser(req: Request): Promise<AuthUser> {
  const user = await loadSessionUser(await verifySession(sessionTokenFromRequest(req)));
  if (!user) throw new HttpError(401, "UNAUTHENTICATED", "Please log in to continue.", { clearSession: true });
  if (user.status === "SUSPENDED") throw suspendedError();
  return user;
}

/** The signed-in user, who must have one of `roles`. */
export async function requireRole(req: Request, ...roles: Role[]): Promise<AuthUser> {
  const user = await requireUser(req);
  if (!roles.includes(user.role)) throw forbidden("Your account cannot use this feature.");
  return user;
}

/** The signed-in shop owner who owns `shopId`. 404 if the shop does not exist, 403 if it belongs to someone else. */
export async function requireShopOwner(req: Request, shopId: string) {
  const user = await requireRole(req, "SHOP_OWNER");
  const shop = await prisma.shop.findUnique({ where: { id: shopId } });
  if (!shop) throw notFound("Shop not found.");
  if (shop.ownerId !== user.id) throw forbidden("This is not your shop.");
  return { user, shop };
}

/**
 * The signed-in user may see `orderId`: its customer, the owner of its shop, or an admin.
 * Returns 404 (not 403) for other users' orders so order ids cannot be probed.
 */
export async function requireOrderAccess(req: Request, orderId: string) {
  const user = await requireUser(req);
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { shop: { select: { ownerId: true } } } });
  if (!order) throw notFound("Order not found.");
  const access = orderAccessFor(user, order);
  if (!access) throw notFound("Order not found.");
  return { user, order, access };
}
