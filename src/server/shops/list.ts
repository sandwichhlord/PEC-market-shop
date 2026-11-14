import { prisma } from "@/server/db";

/** Shops a customer can browse: every shop whose owner is not suspended, open ones first. */
export function listBrowsableShops() {
  return prisma.shop.findMany({
    where: { owner: { status: { not: "SUSPENDED" } } },
    orderBy: [{ isOpen: "desc" }, { name: "asc" }],
    select: { id: true, name: true, description: true, location: true, logoUrl: true, isOpen: true },
  });
}

/** Headline numbers for a shop owner's dashboard. */
export async function getShopOverview(ownerId: string) {
  const shop = await prisma.shop.findUnique({
    where: { ownerId },
    select: { id: true, name: true, description: true, location: true, logoUrl: true, isOpen: true },
  });
  if (!shop) return null;
  const [newOrders, preparing, ready, dishes] = await Promise.all([
    prisma.order.count({ where: { shopId: shop.id, status: "PLACED_PAID" } }),
    prisma.order.count({ where: { shopId: shop.id, status: "PREPARING" } }),
    prisma.order.count({ where: { shopId: shop.id, status: "READY_FOR_PICKUP" } }),
    prisma.menuItem.count({ where: { shopId: shop.id, isArchived: false } }),
  ]);
  return { shop, counts: { newOrders, preparing, ready, dishes } };
}
