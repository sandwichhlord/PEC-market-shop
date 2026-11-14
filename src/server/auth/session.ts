// Reading and writing the session cookie.
import type { NextResponse } from "next/server";
import { SESSION_COOKIE, SESSION_MAX_AGE_SECONDS, signSession, type SessionClaims } from "./jwt";

function secureCookies(): boolean {
  // Secure cookies only over https; local production runs (npm start, E2E) use plain http on localhost.
  return (process.env.APP_URL ?? "").startsWith("https://");
}

/** Reads one cookie from a raw Cookie header. */
export function readCookie(cookieHeader: string | null, name: string): string | undefined {
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) {
      try {
        return decodeURIComponent(part.slice(eq + 1).trim());
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

export function sessionTokenFromRequest(req: Request): string | undefined {
  return readCookie(req.headers.get("cookie"), SESSION_COOKIE);
}

export async function setSessionCookie(res: NextResponse, claims: SessionClaims): Promise<void> {
  res.cookies.set(SESSION_COOKIE, await signSession(claims), {
    httpOnly: true,
    sameSite: "lax",
    secure: secureCookies(),
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export function clearSessionCookie(res: NextResponse): void {
  res.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: secureCookies(),
    path: "/",
    maxAge: 0,
  });
}
