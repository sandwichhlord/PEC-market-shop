import { NextResponse } from "next/server";
import { shopOrderFilterSchema } from "@/lib/validation/shop-portal";
import { shopIdSchema } from "@/lib/validation/shops";
import { requireShopOwner } from "@/server/auth/guards";
import { withErrors } from "@/server/http";
import { countShopOrders, listShopOrders } from "@/server/shops/orders";

/** GET /api/shops/:shopId/orders?filter=active|completed|disputes → { orders, counts } (owner only). */
export const GET = withErrors(async (req: Request, ctx: { params: Promise<{ shopId: string }> }) => {
  const { shopId } = shopIdSchema.parse(await ctx.params);
  await requireShopOwner(req, shopId);
  const { filter } = shopOrderFilterSchema.parse({ filter: new URL(req.url).searchParams.get("filter") ?? undefined });
  const [orders, counts] = await Promise.all([listShopOrders(shopId, filter), countShopOrders(shopId)]);
  return NextResponse.json({ filter, orders, counts });
});
