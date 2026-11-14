// Admin lists: users (search by name / email, filter by role and status) and shops.
import type { Prisma } from "@/generated/prisma/client";
import type { UserListQuery } from "@/lib/validation/admin";
import { prisma } from "@/server/db";
import { roundRating } from "@/server/shops/list";

/** Users matching the filters, newest first, capped at 200. Includes the shop (owners) and report counts. */
export async function listUsers({ q, role, status }: UserListQuery) {
  const where: Prisma.UserWhereInput = {
    ...(role ? { role } : {}),
    ...(status ? { status } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
            { phone: { contains: q } },
          ],
        }
      : {}),
  };
  return prisma.user.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    take: 200,
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      role: true,
      status: true,
      warningMessage: true,
      createdAt: true,
      shop: { select: { id: true, name: true } },
      _count: { select: { reportsAgainst: true, orders: true } },
    },
  });
}

export type AdminUser = Awaited<ReturnType<typeof listUsers>>[number];

/** Every shop (including those of suspended owners) with owner, order counts and rating. */
export async function listShops({ q }: { q?: string } = {}) {
  const shops = await prisma.shop.findMany({
    where: q ? { name: { contains: q, mode: "insensitive" } } : {},
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      location: true,
      logoUrl: true,
      isOpen: true,
      createdAt: true,
      owner: { select: { id: true, name: true, email: true, status: true, warningMessage: true } },
      _count: { select: { orders: { where: { status: { notIn: ["PENDING_PAYMENT", "PAYMENT_FAILED"] } } }, menuItems: { where: { isArchived: false } } } },
    },
  });
  const ids = shops.map((s) => s.id);
  const [ratings, disputes] = await Promise.all([
    prisma.review.groupBy({ by: ["shopId"], where: { shopId: { in: ids } }, _avg: { rating: true }, _count: { _all: true } }),
    prisma.complaint.findMany({ where: { status: { in: ["OPEN", "ESCALATED"] }, order: { shopId: { in: ids } } }, select: { order: { select: { shopId: true } } } }),
  ]);
  const ratingBy = new Map(ratings.map((r) => [r.shopId, { average: roundRating(r._avg.rating), count: r._count._all }]));
  const disputesBy = new Map<string, number>();
  for (const d of disputes) disputesBy.set(d.order.shopId, (disputesBy.get(d.order.shopId) ?? 0) + 1);
  return shops.map((s) => ({
    ...s,
    rating: ratingBy.get(s.id) ?? { average: null, count: 0 },
    activeDisputes: disputesBy.get(s.id) ?? 0,
  }));
}

export type AdminShop = Awaited<ReturnType<typeof listShops>>[number];

/** Shops for the disputes filter dropdown. */
export function shopOptions() {
  return prisma.shop.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } });
}
