import { NextResponse } from "next/server";
import { kitchenStatusSchema, shopOrderParamsSchema } from "@/lib/validation/shop-portal";
import { requireShopOwner } from "@/server/auth/guards";
import { readJson, withErrors } from "@/server/http";
import { advanceShopOrder } from "@/server/shops/orders";

/**
 * POST JSON { to: PREPARING | READY_FOR_PICKUP | COMPLETED } → { order }. Kitchen actions on the shop dashboard;
 * the state machine (via changeStatus) rejects moves that are not allowed from the order's current status (409).
 */
export const POST = withErrors(async (req: Request, ctx: { params: Promise<{ shopId: string; orderId: string }> }) => {
  const { shopId, orderId } = shopOrderParamsSchema.parse(await ctx.params);
  const { user } = await requireShopOwner(req, shopId);
  const { to } = kitchenStatusSchema.parse(await readJson(req));
  const order = await advanceShopOrder(shopId, orderId, to, { id: user.id, role: user.role });
  return NextResponse.json({ order });
});
