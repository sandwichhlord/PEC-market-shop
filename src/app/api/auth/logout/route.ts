import { NextResponse } from "next/server";
import { safeNextPath } from "@/lib/portals";
import { clearSessionCookie } from "@/server/auth/session";

// No guard: logging out only ever clears the caller's own cookie, and must work for stale or suspended sessions.

/** POST (from the UI): clears the session cookie. */
export async function POST() {
  const res = NextResponse.json({ ok: true });
  clearSessionCookie(res);
  return res;
}

/**
 * GET /api/auth/logout?to=/login&reason=suspended — used by portal layouts (which cannot set cookies) to end a
 * stale or suspended session and land on a login page. `to` must be a same-origin path.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const target = new URL(safeNextPath(url.searchParams.get("to")) ?? "/login", url.origin);
  const reason = url.searchParams.get("reason");
  if (reason === "suspended") target.searchParams.set("reason", "suspended");
  const res = NextResponse.redirect(target, 303);
  clearSessionCookie(res);
  return res;
}
