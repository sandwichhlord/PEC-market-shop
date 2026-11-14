import { NextResponse } from "next/server";
import { shopOrderParamsSchema } from "@/lib/validation/shop-portal";
import { requireShopOwner } from "@/server/auth/guards";
import { withErrors } from "@/server/http";
import { getShopOrder } from "@/server/shops/orders";

/** GET /api/shops/:shopId/orders/:orderId → { order } with items, timeline and disputes (owner only). */
export const GET = withErrors(async (req: Request, ctx: { params: Promise<{ shopId: string; orderId: string }> }) => {
  const { shopId, orderId } = shopOrderParamsSchema.parse(await ctx.params);
  await requireShopOwner(req, shopId);
  return NextResponse.json({ order: await getShopOrder(shopId, orderId) });
});
