import { NextResponse } from "next/server";
import { MENU_FIELDS, menuItemCreateSchema } from "@/lib/validation/shop-portal";
import { shopIdSchema } from "@/lib/validation/shops";
import { requireShopOwner } from "@/server/auth/guards";
import { formStrings, readForm, withErrors } from "@/server/http";
import { createMenuItem, listOwnerMenu } from "@/server/shops/menu";
import { optionalImageField } from "@/server/storage/image";

type Ctx = { params: Promise<{ shopId: string }> };

/** GET /api/shops/:shopId/menu — the owner's live dishes (owner only). */
export const GET = withErrors(async (req: Request, ctx: Ctx) => {
  const { shopId } = shopIdSchema.parse(await ctx.params);
  await requireShopOwner(req, shopId);
  return NextResponse.json({ dishes: await listOwnerMenu(shopId) });
});

/** POST multipart { name, description?, pricePaise, prepTimeMinutes, inStock?, photo? } → { dish } (owner only). */
export const POST = withErrors(async (req: Request, ctx: Ctx) => {
  const { shopId } = shopIdSchema.parse(await ctx.params);
  await requireShopOwner(req, shopId);
  const form = await readForm(req);
  const input = menuItemCreateSchema.parse(formStrings(form, MENU_FIELDS));
  const photo = await optionalImageField(form, "photo");
  return NextResponse.json({ dish: await createMenuItem(shopId, input, photo) }, { status: 201 });
});
