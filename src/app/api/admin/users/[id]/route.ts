import { NextResponse } from "next/server";
import { accountActionSchema, adminIdSchema } from "@/lib/validation/admin";
import { actOnAccount } from "@/server/admin/accounts";
import { requireRole } from "@/server/auth/guards";
import { readJson, withErrors } from "@/server/http";

/** POST /api/admin/users/:id { action: "warn", message } | { action: "suspend" | "reinstate" } → { changed, user }. Admin only. */
export const POST = withErrors(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  await requireRole(req, "ADMIN");
  const { id } = adminIdSchema.parse(await ctx.params);
  const action = accountActionSchema.parse(await readJson(req));
  return NextResponse.json(await actOnAccount(id, action));
});
