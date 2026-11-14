// Menu management for a shop owner. Callers have already checked ownership of `shopId` (requireShopOwner);
// every query here is additionally scoped by shopId so a dish id from another shop is simply "not found".
import { Prisma } from "@/generated/prisma/client";
import type { MenuItemCreateInput, MenuItemUpdateInput } from "@/lib/validation/shop-portal";
import { prisma } from "@/server/db";
import { notFound } from "@/server/http";
import { emit } from "@/server/realtime/emit";
import { getStorage } from "@/server/storage";
import type { ValidImage } from "@/server/storage/image";

export const OWNER_DISH_SELECT = {
  id: true,
  name: true,
  description: true,
  photoUrl: true,
  pricePaise: true,
  prepTimeMinutes: true,
  inStock: true,
} as const;

/** The shop's live (non-archived) dishes, oldest first — the same order customers see. */
export function listOwnerMenu(shopId: string) {
  return prisma.menuItem.findMany({
    where: { shopId, isArchived: false },
    orderBy: [{ createdAt: "asc" }, { name: "asc" }],
    select: OWNER_DISH_SELECT,
  });
}

export type OwnerDish = Awaited<ReturnType<typeof listOwnerMenu>>[number];

async function findLiveDish(shopId: string, itemId: string) {
  const dish = await prisma.menuItem.findFirst({ where: { id: itemId, shopId, isArchived: false }, select: { id: true } });
  if (!dish) throw notFound("Dish not found.");
  return dish;
}

async function savePhoto(photo: ValidImage | null): Promise<string | undefined> {
  if (!photo) return undefined;
  const stored = await getStorage().save({ folder: "menu", data: photo.data, contentType: photo.contentType });
  return stored.url;
}

export async function createMenuItem(shopId: string, input: MenuItemCreateInput, photo: ValidImage | null): Promise<OwnerDish> {
  const photoUrl = await savePhoto(photo);
  const dish = await prisma.menuItem.create({ data: { shopId, ...input, photoUrl: photoUrl ?? null }, select: OWNER_DISH_SELECT });
  emit({ type: "menu:item", shopId, itemId: dish.id, inStock: dish.inStock, archived: false });
  return dish;
}

/** Partial edit. A new photo replaces the old one (old files are kept: past pages may still reference them). */
export async function updateMenuItem(
  shopId: string,
  itemId: string,
  input: MenuItemUpdateInput,
  photo: ValidImage | null,
): Promise<OwnerDish> {
  await findLiveDish(shopId, itemId);
  const photoUrl = await savePhoto(photo);
  const dish = await prisma.menuItem.update({
    where: { id: itemId },
    data: { ...input, ...(photoUrl ? { photoUrl } : {}) },
    select: OWNER_DISH_SELECT,
  });
  emit({ type: "menu:item", shopId, itemId, inStock: dish.inStock, archived: false });
  return dish;
}

export async function setStock(shopId: string, itemId: string, inStock: boolean): Promise<OwnerDish> {
  await findLiveDish(shopId, itemId);
  const dish = await prisma.menuItem.update({ where: { id: itemId }, data: { inStock }, select: OWNER_DISH_SELECT });
  emit({ type: "menu:item", shopId, itemId, inStock, archived: false });
  return dish;
}

/**
 * Deletes a dish. A dish that appears in any order is archived instead (order history keeps pointing at it);
 * an unused dish is removed outright.
 */
export async function deleteMenuItem(shopId: string, itemId: string): Promise<{ result: "archived" | "deleted" }> {
  await findLiveDish(shopId, itemId);
  let result: "archived" | "deleted" = "deleted";
  if ((await prisma.orderItem.count({ where: { menuItemId: itemId } })) > 0) {
    result = "archived";
  } else {
    try {
      await prisma.menuItem.delete({ where: { id: itemId } });
    } catch (err) {
      // An order referencing the dish was placed in the meantime (FK restrict): archive it instead.
      if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2003")) throw err;
      result = "archived";
    }
  }
  if (result === "archived") await prisma.menuItem.update({ where: { id: itemId }, data: { isArchived: true } });
  emit({ type: "menu:item", shopId, itemId, inStock: false, archived: true });
  return { result };
}
