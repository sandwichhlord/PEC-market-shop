import { NextResponse } from "next/server";
import { ROLE_HOME } from "@/lib/portals";
import { loginSchema } from "@/lib/validation/auth";
import { login } from "@/server/auth/service";
import { setSessionCookie } from "@/server/auth/session";
import { readJson, withErrors } from "@/server/http";

// Public by design: this is where a session is created. `portal` says which login page was used.
export const POST = withErrors(async (req: Request) => {
  const input = loginSchema.parse(await readJson(req));
  const user = await login(input);
  const res = NextResponse.json({ user, redirectTo: ROLE_HOME[user.role] });
  await setSessionCookie(res, { userId: user.id, role: user.role });
  return res;
});
