import { NextResponse } from "next/server";
import { adminDisputeActionSchema, adminIdSchema } from "@/lib/validation/admin";
import { adminDisputeAction, getAdminDispute } from "@/server/admin/disputes";
import { requireRole } from "@/server/auth/guards";
import { notFound, readJson, withErrors } from "@/server/http";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/admin/disputes/:id → { dispute } with the order's items, payment and timeline. Admin only. */
export const GET = withErrors(async (req: Request, ctx: Ctx) => {
  await requireRole(req, "ADMIN");
  const { id } = adminIdSchema.parse(await ctx.params);
  const dispute = await getAdminDispute(id);
  if (!dispute) throw notFound("Dispute not found.");
  return NextResponse.json({ dispute });
});

/**
 * POST /api/admin/disputes/:id { action: "refund", wholeOrder? | itemIds?, note } | { action: "resolve", note }
 * → { complaint, order }. Admin only.
 */
export const POST = withErrors(async (req: Request, ctx: Ctx) => {
  const admin = await requireRole(req, "ADMIN");
  const { id } = adminIdSchema.parse(await ctx.params);
  const action = adminDisputeActionSchema.parse(await readJson(req));
  return NextResponse.json(await adminDisputeAction(id, { id: admin.id, role: "ADMIN" }, action));
});
