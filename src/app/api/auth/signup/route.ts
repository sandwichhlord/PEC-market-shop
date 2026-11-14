import { NextResponse } from "next/server";
import { ROLE_HOME } from "@/lib/portals";
import { customerSignupSchema } from "@/lib/validation/auth";
import { signupCustomer } from "@/server/auth/service";
import { setSessionCookie } from "@/server/auth/session";
import { readJson, withErrors } from "@/server/http";

// Public by design: creating an account is how a visitor gets a session (no guard possible).
export const POST = withErrors(async (req: Request) => {
  const input = customerSignupSchema.parse(await readJson(req));
  const user = await signupCustomer(input);
  const res = NextResponse.json({ user, redirectTo: ROLE_HOME.CUSTOMER }, { status: 201 });
  await setSessionCookie(res, { userId: user.id, role: user.role });
  return res;
});
