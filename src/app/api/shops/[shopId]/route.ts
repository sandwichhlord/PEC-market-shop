import { NextResponse } from "next/server";
import { PROFILE_FIELDS, shopProfileSchema } from "@/lib/validation/shop-portal";
import { shopIdSchema } from "@/lib/validation/shops";
import { requireShopOwner, requireUser } from "@/server/auth/guards";
import { formStrings, notFound, readForm, readJson, withErrors } from "@/server/http";
import { getShopMenu } from "@/server/shops/list";
import { updateShopProfile } from "@/server/shops/profile";
import { optionalImageField, type ValidImage } from "@/server/storage/image";

type Ctx = { params: Promise<{ shopId: string }> };

/** GET /api/shops/:shopId — one shop with its rating and non-archived menu (used to refetch stock). */
export const GET = withErrors(async (req: Request, ctx: Ctx) => {
  await requireUser(req);
  const { shopId } = shopIdSchema.parse(await ctx.params);
  const shop = await getShopMenu(shopId);
  if (!shop) throw notFound("Shop not found.");
  return NextResponse.json({ shop });
});

/**
 * PATCH /api/shops/:shopId — edit the shop profile (owner only). Accepts multipart (any of name, description,
 * location, isOpen, plus an optional `logo` image) or JSON (same text fields; used by the open/closed toggle).
 */
export const PATCH = withErrors(async (req: Request, ctx: Ctx) => {
  const { shopId } = shopIdSchema.parse(await ctx.params);
  await requireShopOwner(req, shopId);
  let raw: unknown;
  let logo: ValidImage | null = null;
  if (req.headers.get("content-type")?.includes("application/json")) {
    raw = await readJson(req);
  } else {
    const form = await readForm(req, { field: "logo" });
    raw = formStrings(form, PROFILE_FIELDS);
    logo = await optionalImageField(form, "logo");
  }
  const input = shopProfileSchema.parse(raw);
  return NextResponse.json({ shop: await updateShopProfile(shopId, input, logo) });
});
