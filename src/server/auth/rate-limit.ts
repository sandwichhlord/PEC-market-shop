// Simple in-memory login throttle (P12). Counts *failed* logins in a fixed window under three keys:
//   - account + client IP (tight: stops one client guessing one password),
//   - account alone (looser: slows a guess spread over many IPs without letting one stranger lock the owner out fast),
//   - client IP alone (stops one client spraying many accounts).
// Once a key reaches its limit, logins it covers are refused with 429 until the window ends, even with the right
// password. A successful login clears that account's counters. State lives in this process only (one server, see
// DECISIONS.md), so a restart forgets it.
import { HttpError } from "@/server/http";

export interface LoginLimits {
  /** Failed attempts allowed per account from one client IP within the window. */
  perAccountIp: number;
  /** Failed attempts allowed per account from all IPs together within the window. */
  perAccount: number;
  /** Failed attempts allowed per client IP within the window (across all emails). */
  perIp: number;
  windowMs: number;
}

export const LOGIN_LIMITS: LoginLimits = { perAccountIp: 5, perAccount: 20, perIp: 30, windowMs: 15 * 60 * 1000 };

interface Bucket {
  failures: number;
  resetAt: number;
}

/** Above this many tracked keys, expired buckets are swept on the next write so memory stays bounded. */
const SWEEP_THRESHOLD = 10_000;

export class LoginRateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(
    private readonly limits: LoginLimits = LOGIN_LIMITS,
    private readonly now: () => number = Date.now,
  ) {}

  private keys(email: string, ip: string | null): { key: string; limit: number }[] {
    const keys = [
      { key: `acct-ip:${email}|${ip ?? "unknown"}`, limit: this.limits.perAccountIp },
      { key: `acct:${email}`, limit: this.limits.perAccount },
    ];
    if (ip) keys.push({ key: `ip:${ip}`, limit: this.limits.perIp });
    return keys;
  }

  private live(key: string): Bucket | undefined {
    const bucket = this.buckets.get(key);
    if (bucket && bucket.resetAt <= this.now()) {
      this.buckets.delete(key);
      return undefined;
    }
    return bucket;
  }

  /** Throws 429 TOO_MANY_ATTEMPTS (with `retryAfterSeconds`) if any key covering this attempt is locked out. */
  check(email: string, ip: string | null): void {
    for (const { key, limit } of this.keys(email, ip)) {
      const bucket = this.live(key);
      if (bucket && bucket.failures >= limit) {
        const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - this.now()) / 1000));
        const minutes = Math.ceil(retryAfterSeconds / 60);
        throw new HttpError(
          429,
          "TOO_MANY_ATTEMPTS",
          `Too many failed login attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`,
          { retryAfterSeconds },
        );
      }
    }
  }

  recordFailure(email: string, ip: string | null): void {
    if (this.buckets.size > SWEEP_THRESHOLD) this.sweep();
    for (const { key } of this.keys(email, ip)) {
      const bucket = this.live(key);
      if (bucket) bucket.failures += 1;
      else this.buckets.set(key, { failures: 1, resetAt: this.now() + this.limits.windowMs });
    }
  }

  /** A correct password clears the account's counters (the IP counter keeps running). */
  recordSuccess(email: string, ip: string | null): void {
    this.buckets.delete(`acct-ip:${email}|${ip ?? "unknown"}`);
    this.buckets.delete(`acct:${email}`);
  }

  private sweep(): void {
    const now = this.now();
    for (const [key, bucket] of this.buckets) if (bucket.resetAt <= now) this.buckets.delete(key);
  }
}

const globalForLimiter = globalThis as unknown as { loginRateLimiter?: LoginRateLimiter };

/** One limiter per server process (kept on globalThis so dev-mode module reloads share it). */
export function loginRateLimiter(): LoginRateLimiter {
  globalForLimiter.loginRateLimiter ??= new LoginRateLimiter();
  return globalForLimiter.loginRateLimiter;
}

/**
 * Client IP from the first `x-forwarded-for` hop, else `x-real-ip`, else null (then only the per-account limits
 * apply). server.ts overwrites `x-forwarded-for` with the socket address unless TRUST_PROXY=true, so clients
 * cannot spoof it.
 */
export function clientIp(req: Request): string | null {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwarded) return forwarded.slice(0, 64);
  const real = req.headers.get("x-real-ip")?.trim();
  return real ? real.slice(0, 64) : null;
}
