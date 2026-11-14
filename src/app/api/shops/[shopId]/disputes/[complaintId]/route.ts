import { NextResponse } from "next/server";
import { disputeActionSchema, disputeParamsSchema } from "@/lib/validation/disputes";
import { requireShopOwner } from "@/server/auth/guards";
import { respondToDispute } from "@/server/disputes/respond";
import { readJson, withErrors } from "@/server/http";

/**
 * POST /api/shops/:shopId/disputes/:complaintId
 *   { action: "approve", message? } | { action: "reject", reason } | { action: "reply", message } | { action: "resolve", resolution? }
 * → { changed, complaint, order }. Owner only; repeating an approve / reject / resolve is a no-op (changed: false).
 */
export const POST = withErrors(async (req: Request, ctx: { params: Promise<{ shopId: string; complaintId: string }> }) => {
  const { shopId, complaintId } = disputeParamsSchema.parse(await ctx.params);
  const { user } = await requireShopOwner(req, shopId);
  const action = disputeActionSchema.parse(await readJson(req));
  return NextResponse.json(await respondToDispute(shopId, complaintId, { id: user.id, role: "SHOP_OWNER" }, action));
});
