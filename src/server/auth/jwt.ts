// Session tokens: HS256 JWTs signed with JWT_SECRET. Edge/Node-safe (jose only, no DB) so the proxy can use it.
import { SignJWT, jwtVerify } from "jose";
import type { Role } from "@/generated/prisma/enums";

export const SESSION_COOKIE = "pec_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days

export interface SessionClaims {
  userId: string;
  role: Role;
}

const ROLES: readonly Role[] = ["CUSTOMER", "SHOP_OWNER", "ADMIN"];

function secretKey(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("JWT_SECRET must be set to at least 32 characters (see .env.example).");
  }
  return new TextEncoder().encode(secret);
}

export async function signSession(claims: SessionClaims): Promise<string> {
  return new SignJWT({ role: claims.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(secretKey());
}

/** Returns the claims of a valid, unexpired token, or null for anything else (missing, tampered, expired). */
export async function verifySession(token: string | undefined | null): Promise<SessionClaims | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    const role = payload.role;
    if (typeof payload.sub !== "string" || typeof role !== "string" || !ROLES.includes(role as Role)) return null;
    return { userId: payload.sub, role: role as Role };
  } catch {
    return null;
  }
}
