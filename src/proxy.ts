// Next.js proxy (formerly "middleware"): role-based redirects for pages. API routes are not matched — they
// enforce access themselves with src/server/auth/guards.ts. Account status (suspended) needs the database and is
// re-checked by the portal layouts (src/server/auth/current.ts).
import { NextResponse, type NextRequest } from "next/server";
import { ROLE_HOME, isAuthPath, loginPathFor, requiredRoleForPath } from "@/lib/portals";
import { SESSION_COOKIE, verifySession } from "@/server/auth/jwt";

export async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = await verifySession(token);
  const staleCookie = Boolean(token) && !session;

  const redirectTo = (path: string) => {
    const res = NextResponse.redirect(new URL(path, req.url));
    if (staleCookie) res.cookies.delete(SESSION_COOKIE);
    return res;
  };

  // Signed-in users visiting the landing page or an auth page go to their portal.
  if (session && (pathname === "/" || isAuthPath(pathname))) return redirectTo(ROLE_HOME[session.role]);

  const required = requiredRoleForPath(pathname);
  if (required) {
    if (!session) return redirectTo(`${loginPathFor(pathname)}?next=${encodeURIComponent(pathname + search)}`);
    if (session.role !== required) return redirectTo(ROLE_HOME[session.role]);
  }

  const res = NextResponse.next();
  if (staleCookie) res.cookies.delete(SESSION_COOKIE);
  return res;
}

export const config = {
  // Pages only: skip API routes, Next internals and any path with a file extension (static assets).
  matcher: ["/((?!api/|_next/|socket\\.io|.*\\.[A-Za-z0-9]+$).*)"],
};
