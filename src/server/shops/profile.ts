// Shop profile edits (name, description, logo, location, open/closed). Ownership is checked by the caller.
import type { ShopProfileInput } from "@/lib/validation/shop-portal";
import { prisma } from "@/server/db";
import { emit } from "@/server/realtime/emit";
import { getStorage } from "@/server/storage";
import type { ValidImage } from "@/server/storage/image";

export const SHOP_PROFILE_SELECT = {
  id: true,
  name: true,
  description: true,
  location: true,
  logoUrl: true,
  isOpen: true,
} as const;

export function getShopProfileByOwner(ownerId: string) {
  return prisma.shop.findUnique({ where: { ownerId }, select: SHOP_PROFILE_SELECT });
}

export type ShopProfile = NonNullable<Awaited<ReturnType<typeof getShopProfileByOwner>>>;

/** Partial update: only the fields sent change. A new logo replaces the old URL (the old file is kept). */
export async function updateShopProfile(shopId: string, input: ShopProfileInput, logo: ValidImage | null): Promise<ShopProfile> {
  const logoUrl = logo
    ? (await getStorage().save({ folder: "logos", data: logo.data, contentType: logo.contentType })).url
    : undefined;
  const shop = await prisma.shop.update({
    where: { id: shopId },
    data: { ...input, ...(logoUrl ? { logoUrl } : {}) },
    select: SHOP_PROFILE_SELECT,
  });
  emit({ type: "shop:updated", shopId, isOpen: shop.isOpen });
  return shop;
}
