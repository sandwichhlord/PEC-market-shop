// Session helpers for server components (layouts/pages). API routes use guards.ts instead.
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Role } from "@/generated/prisma/enums";
import { PORTAL_LOGIN, ROLE_HOME, ROLE_PORTAL } from "@/lib/portals";
import { loadSessionUser, type AuthUser } from "./guards";
import { SESSION_COOKIE, verifySession } from "./jwt";

/** The signed-in user (any status), or null. */
export async function getCurrentUser(): Promise<AuthUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return loadSessionUser(await verifySession(token));
}

/**
 * For portal layouts: returns the signed-in user with `role`. Otherwise redirects — a missing/stale or suspended
 * session goes through /api/auth/logout (which clears the cookie) to the portal's login page; a user of another
 * role goes to their own home. The proxy already handles the common cases; this re-checks against the database.
 */
export async function requirePageUser(role: Role): Promise<AuthUser> {
  const user = await getCurrentUser();
  const login = PORTAL_LOGIN[ROLE_PORTAL[role]];
  if (!user) redirect(`/api/auth/logout?to=${encodeURIComponent(login)}`);
  if (user.status === "SUSPENDED") redirect(`/api/auth/logout?to=${encodeURIComponent(login)}&reason=suspended`);
  if (user.role !== role) redirect(ROLE_HOME[user.role]);
  return user;
}
