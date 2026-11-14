import { NextResponse } from "next/server";
import { adminIdSchema, reportActionSchema } from "@/lib/validation/admin";
import { requireRole } from "@/server/auth/guards";
import { readJson, withErrors } from "@/server/http";
import { actOnReport } from "@/server/reports/reports";

/**
 * POST /api/admin/reports/:id { action: "warn", message, note? } | { action: "suspend" | "reinstate" | "dismiss", note? }
 * → { changed, report }. Admin only.
 */
export const POST = withErrors(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  await requireRole(req, "ADMIN");
  const { id } = adminIdSchema.parse(await ctx.params);
  const action = reportActionSchema.parse(await readJson(req));
  return NextResponse.json(await actOnReport(id, action));
});
