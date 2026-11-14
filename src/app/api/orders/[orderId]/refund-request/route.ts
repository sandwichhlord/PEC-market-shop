import { NextResponse } from "next/server";
import { orderIdSchema } from "@/lib/validation/checkout";
import { refundRequestSchema } from "@/lib/validation/disputes";
import { requireOrderAccess } from "@/server/auth/guards";
import { requestRefund } from "@/server/disputes/customer";
import { forbidden, readJson, withErrors } from "@/server/http";

/**
 * POST /api/orders/:orderId/refund-request { itemIds?: string[], wholeOrder?: boolean, reason }
 * → 201 { complaintId, refundAmountPaise, order }. The order's customer only.
 */
export const POST = withErrors(async (req: Request, ctx: { params: Promise<{ orderId: string }> }) => {
  const { orderId } = orderIdSchema.parse(await ctx.params);
  const { user, access } = await requireOrderAccess(req, orderId);
  if (access !== "customer") throw forbidden("Only the customer who placed the order can request a refund.");
  const input = refundRequestSchema.parse(await readJson(req));
  return NextResponse.json(await requestRefund(orderId, user.id, input), { status: 201 });
});
