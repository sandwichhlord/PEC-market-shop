import { NextResponse } from "next/server";
import { menuItemParamsSchema, stockSchema } from "@/lib/validation/shop-portal";
import { requireShopOwner } from "@/server/auth/guards";
import { readJson, withErrors } from "@/server/http";
import { setStock } from "@/server/shops/menu";

type Ctx = { params: Promise<{ shopId: string; itemId: string }> };

/** PATCH JSON { inStock } → { dish }. The one-tap stock toggle (owner only). */
export const PATCH = withErrors(async (req: Request, ctx: Ctx) => {
  const { shopId, itemId } = menuItemParamsSchema.parse(await ctx.params);
  await requireShopOwner(req, shopId);
  const { inStock } = stockSchema.parse(await readJson(req));
  return NextResponse.json({ dish: await setStock(shopId, itemId, inStock) });
});
