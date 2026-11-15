import { NextResponse } from "next/server";
import { ROLE_HOME } from "@/lib/portals";
import { loginSchema } from "@/lib/validation/auth";
import { clientIp, loginRateLimiter } from "@/server/auth/rate-limit";
import { login } from "@/server/auth/service";
import { setSessionCookie } from "@/server/auth/session";
import { HttpError, readJson, withErrors } from "@/server/http";

// Public by design: this is where a session is created. `portal` says which login page was used.
// Failed attempts are throttled per account(+IP) and per client IP (429 TOO_MANY_ATTEMPTS, see rate-limit.ts).
export const POST = withErrors(async (req: Request) => {
  const input = loginSchema.parse(await readJson(req));
  const limiter = loginRateLimiter();
  const ip = clientIp(req);
  limiter.check(input.email, ip);
  let user;
  try {
    user = await login(input);
  } catch (err) {
    if (err instanceof HttpError && err.code === "INVALID_CREDENTIALS") limiter.recordFailure(input.email, ip);
    throw err;
  }
  limiter.recordSuccess(input.email, ip);
  const res = NextResponse.json({ user, redirectTo: ROLE_HOME[user.role] });
  await setSessionCookie(res, { userId: user.id, role: user.role });
  return res;
});
