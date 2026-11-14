import { NextResponse } from "next/server";
import { reviewListSchema } from "@/lib/validation/reviews";
import { shopIdSchema } from "@/lib/validation/shops";
import { requireUser } from "@/server/auth/guards";
import { notFound, withErrors } from "@/server/http";
import { listShopReviews } from "@/server/reviews/reviews";
import { isBrowsableShop, shopRating } from "@/server/shops/list";

/** GET /api/shops/:shopId/reviews?limit= → { rating, reviews } (newest first). Any signed-in user; hidden shops 404. */
export const GET = withErrors(async (req: Request, ctx: { params: Promise<{ shopId: string }> }) => {
  await requireUser(req);
  const { shopId } = shopIdSchema.parse(await ctx.params);
  const { limit } = reviewListSchema.parse(Object.fromEntries(new URL(req.url).searchParams));
  if (!(await isBrowsableShop(shopId))) throw notFound("Shop not found.");
  const [rating, reviews] = await Promise.all([shopRating(shopId), listShopReviews(shopId, limit)]);
  return NextResponse.json({ rating, reviews });
});
