import { beforeEach, describe, expect, it } from "vitest";
import { POST as login } from "@/app/api/auth/login/route";
import { LOGIN_LIMITS } from "@/server/auth/rate-limit";
import { TEST_PASSWORD, createUser, sessionCookieFrom, uid } from "../helpers/fixtures";

function attempt(email: string, password: string, ip?: string) {
  const headers = new Headers({ "content-type": "application/json" });
  if (ip) headers.set("x-forwarded-for", ip);
  return login(
    new Request("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers,
      body: JSON.stringify({ email, password, portal: "customer" }),
    }),
  );
}

describe("login rate limit", () => {
  beforeEach(() => {
    (globalThis as { loginRateLimiter?: unknown }).loginRateLimiter = undefined;
  });

  it(`locks an account (from one client) after ${LOGIN_LIMITS.perAccountIp} failures, even for the right password`, async () => {
    const user = await createUser();
    for (let i = 0; i < LOGIN_LIMITS.perAccountIp; i++) {
      expect((await attempt(user.email, "wrong-password")).status).toBe(401);
    }
    const locked = await attempt(user.email, TEST_PASSWORD);
    expect(locked.status).toBe(429);
    expect(locked.headers.get("retry-after")).toMatch(/^\d+$/);
    expect((await locked.json()).error).toMatchObject({ code: "TOO_MANY_ATTEMPTS" });
    expect(sessionCookieFrom(locked)).toBeNull();
    // Case and spaces don't get around it (the schema normalises the email first).
    expect((await attempt(`  ${user.email.toUpperCase()} `, TEST_PASSWORD)).status).toBe(429);
  });

  it("another client can still log in to a locked account", async () => {
    const user = await createUser();
    for (let i = 0; i < LOGIN_LIMITS.perAccountIp; i++) await attempt(user.email, "wrong-password", "192.0.2.10");
    expect((await attempt(user.email, TEST_PASSWORD, "192.0.2.10")).status).toBe(429);
    expect((await attempt(user.email, TEST_PASSWORD, "192.0.2.11")).status).toBe(200);
  });

  it("a successful login resets the account's counter", async () => {
    const user = await createUser();
    for (let i = 0; i < LOGIN_LIMITS.perAccountIp - 1; i++) await attempt(user.email, "wrong-password");
    expect((await attempt(user.email, TEST_PASSWORD)).status).toBe(200);
    for (let i = 0; i < LOGIN_LIMITS.perAccountIp - 1; i++) await attempt(user.email, "wrong-password");
    expect((await attempt(user.email, TEST_PASSWORD)).status).toBe(200);
  });

  it("limits one client IP spraying many emails, but not other IPs", async () => {
    const ip = `198.51.100.${Math.floor(Math.random() * 200)}`;
    for (let i = 0; i < LOGIN_LIMITS.perIp; i++) {
      expect((await attempt(`nobody-${uid()}@test.pec`, "wrong-password", ip)).status).toBe(401);
    }
    const user = await createUser();
    expect((await attempt(user.email, TEST_PASSWORD, ip)).status).toBe(429);
    expect((await attempt(user.email, TEST_PASSWORD, "203.0.113.9")).status).toBe(200);
  });

  it("does not count wrong-portal or suspended refusals as failed passwords", async () => {
    const owner = await createUser({ role: "SHOP_OWNER" });
    for (let i = 0; i < LOGIN_LIMITS.perAccountIp + 1; i++) {
      expect((await attempt(owner.email, TEST_PASSWORD)).status).toBe(403);
    }
  });
});
