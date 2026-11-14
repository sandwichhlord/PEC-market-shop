import { NextResponse } from "next/server";
import { requireUser } from "@/server/auth/guards";
import { withErrors } from "@/server/http";
import { getMe } from "@/server/users/me";

export const GET = withErrors(async (req: Request) => {
  const user = await requireUser(req);
  return NextResponse.json(await getMe(user));
});
