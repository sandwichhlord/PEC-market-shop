import { NextResponse } from "next/server";
import { MENU_FIELDS, menuItemParamsSchema, menuItemUpdateSchema } from "@/lib/validation/shop-portal";
import { requireShopOwner } from "@/server/auth/guards";
import { formStrings, readForm, withErrors } from "@/server/http";
import { deleteMenuItem, updateMenuItem } from "@/server/shops/menu";
import { optionalImageField } from "@/server/storage/image";

type Ctx = { params: Promise<{ shopId: string; itemId: string }> };

/** PATCH multipart with any of the dish fields and/or a new `photo` → { dish } (owner only). */
export const PATCH = withErrors(async (req: Request, ctx: Ctx) => {
  const { shopId, itemId } = menuItemParamsSchema.parse(await ctx.params);
  await requireShopOwner(req, shopId);
  const form = await readForm(req);
  const input = menuItemUpdateSchema.parse(formStrings(form, MENU_FIELDS));
  const photo = await optionalImageField(form, "photo");
  return NextResponse.json({ dish: await updateMenuItem(shopId, itemId, input, photo) });
});

/** DELETE → { result: "deleted" | "archived" }. Dishes that appear in orders are archived (soft-deleted). */
export const DELETE = withErrors(async (req: Request, ctx: Ctx) => {
  const { shopId, itemId } = menuItemParamsSchema.parse(await ctx.params);
  await requireShopOwner(req, shopId);
  return NextResponse.json(await deleteMenuItem(shopId, itemId));
});
