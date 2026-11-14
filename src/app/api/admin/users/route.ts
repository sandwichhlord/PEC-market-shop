import { NextResponse } from "next/server";
import { userListSchema } from "@/lib/validation/admin";
import { listUsers } from "@/server/admin/directory";
import { requireRole } from "@/server/auth/guards";
import { withErrors } from "@/server/http";

/** GET /api/admin/users?q=&role=&status= → { users } (newest first, max 200). Admin only. */
export const GET = withErrors(async (req: Request) => {
  await requireRole(req, "ADMIN");
  const query = userListSchema.parse(Object.fromEntries(new URL(req.url).searchParams));
  return NextResponse.json({ users: await listUsers(query) });
});
