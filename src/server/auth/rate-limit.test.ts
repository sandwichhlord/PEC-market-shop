import { describe, expect, it } from "vitest";
import { HttpError } from "@/server/http";
import { LoginRateLimiter, clientIp } from "./rate-limit";

function limiter() {
  let now = 1_000_000;
  const l = new LoginRateLimiter({ perAccountIp: 3, perAccount: 6, perIp: 5, windowMs: 60_000 }, () => now);
  return { l, advance: (ms: number) => (now += ms) };
}

function refused(fn: () => void): HttpError {
  try {
    fn();
  } catch (err) {
    if (err instanceof HttpError) return err;
    throw err;
  }
  throw new Error("expected a 429");
}

const IP = "10.0.0.1";

describe("LoginRateLimiter", () => {
  it("allows attempts until the account+IP limit, then refuses with 429 and a retry time", () => {
    const { l, advance } = limiter();
    for (let i = 0; i < 3; i++) {
      expect(() => l.check("a@x.test", IP)).not.toThrow();
      l.recordFailure("a@x.test", IP);
    }
    advance(15_000);
    const err = refused(() => l.check("a@x.test", IP));
    expect(err.status).toBe(429);
    expect(err.code).toBe("TOO_MANY_ATTEMPTS");
    expect(err.extra.retryAfterSeconds).toBe(45);
    expect(err.message).toBe("Too many failed login attempts. Try again in 1 minute.");
    // The same account from another client, and other accounts, still work.
    expect(() => l.check("a@x.test", "10.0.0.2")).not.toThrow();
    expect(() => l.check("b@x.test", IP)).not.toThrow();
  });

  it("caps one account across many IPs at the looser per-account limit", () => {
    const { l } = limiter();
    for (let i = 0; i < 6; i++) l.recordFailure("a@x.test", `10.0.1.${i}`);
    expect(refused(() => l.check("a@x.test", "10.0.9.9")).status).toBe(429);
  });

  it("applies the account+IP limit when the IP is unknown", () => {
    const { l } = limiter();
    for (let i = 0; i < 3; i++) l.recordFailure("a@x.test", null);
    expect(refused(() => l.check("a@x.test", null)).status).toBe(429);
  });

  it("unlocks once the window has passed", () => {
    const { l, advance } = limiter();
    for (let i = 0; i < 3; i++) l.recordFailure("a@x.test", IP);
    advance(60_000);
    expect(() => l.check("a@x.test", IP)).not.toThrow();
    l.recordFailure("a@x.test", IP);
    expect(() => l.check("a@x.test", IP)).not.toThrow();
  });

  it("a success clears the account's counters", () => {
    const { l } = limiter();
    l.recordFailure("a@x.test", IP);
    l.recordFailure("a@x.test", IP);
    l.recordSuccess("a@x.test", IP);
    l.recordFailure("a@x.test", IP);
    l.recordFailure("a@x.test", IP);
    expect(() => l.check("a@x.test", IP)).not.toThrow();
  });

  it("limits one IP across many accounts", () => {
    const { l } = limiter();
    for (let i = 0; i < 5; i++) l.recordFailure(`user${i}@x.test`, IP);
    expect(refused(() => l.check("fresh@x.test", IP)).status).toBe(429);
    expect(() => l.check("fresh@x.test", "10.0.0.2")).not.toThrow();
  });
});

describe("clientIp", () => {
  const req = (headers: Record<string, string>) => new Request("http://localhost/api/auth/login", { headers });
  it("uses the first x-forwarded-for hop, then x-real-ip, else null", () => {
    expect(clientIp(req({ "x-forwarded-for": "1.2.3.4, 10.0.0.1" }))).toBe("1.2.3.4");
    expect(clientIp(req({ "x-real-ip": "5.6.7.8" }))).toBe("5.6.7.8");
    expect(clientIp(req({}))).toBeNull();
  });
});
