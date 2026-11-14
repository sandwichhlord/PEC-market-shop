import { prisma } from "@/server/db";

/** Shops customers can see: every shop whose owner is not suspended. */
const BROWSABLE = { owner: { status: { not: "SUSPENDED" as const } } };

export interface ShopRating {
  /** Average star rating rounded to one decimal, or null when the shop has no reviews yet. */
  average: number | null;
  count: number;
}

export const roundRating = (avg: number | null): number | null => (avg === null ? null : Math.round(avg * 10) / 10);

async function ratingsFor(shopIds: string[]): Promise<Map<string, ShopRating>> {
  if (shopIds.length === 0) return new Map();
  const rows = await prisma.review.groupBy({
    by: ["shopId"],
    where: { shopId: { in: shopIds } },
    _avg: { rating: true },
    _count: { _all: true },
  });
  return new Map(rows.map((r) => [r.shopId, { average: roundRating(r._avg.rating), count: r._count._all }]));
}

const NO_RATING: ShopRating = { average: null, count: 0 };

/** Shops a customer can browse, open ones first, optionally filtered by a case-insensitive name search. */
export async function listBrowsableShops({ q }: { q?: string } = {}) {
  const shops = await prisma.shop.findMany({
    where: { ...BROWSABLE, ...(q ? { name: { contains: q, mode: "insensitive" as const } } : {}) },
    orderBy: [{ isOpen: "desc" }, { name: "asc" }],
    select: { id: true, name: true, description: true, location: true, logoUrl: true, isOpen: true },
  });
  const ratings = await ratingsFor(shops.map((s) => s.id));
  return shops.map((shop) => ({ ...shop, rating: ratings.get(shop.id) ?? NO_RATING }));
}

export type BrowsableShop = Awaited<ReturnType<typeof listBrowsableShops>>[number];

/** One browsable shop with its rating and live (non-archived) menu, or null if it does not exist or is hidden. */
export async function getShopMenu(shopId: string) {
  const shop = await prisma.shop.findFirst({
    where: { id: shopId, ...BROWSABLE },
    select: {
      id: true,
      name: true,
      description: true,
      location: true,
      logoUrl: true,
      isOpen: true,
      menuItems: {
        where: { isArchived: false },
        orderBy: [{ createdAt: "asc" }, { name: "asc" }],
        select: {
          id: true,
          name: true,
          description: true,
          photoUrl: true,
          pricePaise: true,
          prepTimeMinutes: true,
          inStock: true,
        },
      },
    },
  });
  if (!shop) return null;
  const ratings = await ratingsFor([shop.id]);
  return { ...shop, rating: ratings.get(shop.id) ?? NO_RATING };
}

export type ShopMenu = NonNullable<Awaited<ReturnType<typeof getShopMenu>>>;
export type MenuDish = ShopMenu["menuItems"][number];

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
