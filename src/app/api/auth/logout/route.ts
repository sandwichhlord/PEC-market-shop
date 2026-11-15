import { NextResponse } from "next/server";
import { z } from "zod";
import { safeNextPath } from "@/lib/portals";
import { clearSessionCookie } from "@/server/auth/session";

// No guard: logging out only ever clears the caller's own cookie, and must work for stale or suspended sessions.

/** POST (from the UI): clears the session cookie. */
export async function POST() {
  const res = NextResponse.json({ ok: true });
  clearSessionCookie(res);
  return res;
}

const logoutQuerySchema = z.object({
  to: z.string().max(2048).nullable().transform((v) => safeNextPath(v) ?? "/login"),
  reason: z.enum(["suspended"]).nullable().catch(null),
});

/**
 * GET /api/auth/logout?to=/login&reason=suspended — used by portal layouts (which cannot set cookies) to end a
 * stale or suspended session and land on a login page. `to` must be a same-origin path (anything else → /login).
 * A cross-site request (another site embedding or linking this URL) is redirected without touching the cookie, so
 * third-party pages cannot log users out.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const parsed = logoutQuerySchema.safeParse({ to: url.searchParams.get("to"), reason: url.searchParams.get("reason") });
  const { to, reason } = parsed.success ? parsed.data : { to: "/login", reason: null };
  const target = new URL(to, url.origin);
  if (reason) target.searchParams.set("reason", reason);
  const res = NextResponse.redirect(target, 303);
  if (req.headers.get("sec-fetch-site") !== "cross-site") clearSessionCookie(res);
  return res;
}
