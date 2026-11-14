import { NextResponse } from "next/server";
import { shopIdSchema } from "@/lib/validation/shops";
import { requireUser } from "@/server/auth/guards";
import { notFound, withErrors } from "@/server/http";
import { getShopMenu } from "@/server/shops/list";

/** GET /api/shops/:shopId — one shop with its rating and non-archived menu (used to refetch stock). */
export const GET = withErrors(async (req: Request, ctx: { params: Promise<{ shopId: string }> }) => {
  await requireUser(req);
  const { shopId } = shopIdSchema.parse(await ctx.params);
  const shop = await getShopMenu(shopId);
  if (!shop) throw notFound("Shop not found.");
  return NextResponse.json({ shop });
});
