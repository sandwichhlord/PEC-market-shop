import { prisma } from "@/server/db";

/** A customer's own orders, newest first. Unpaid checkouts that never completed are included (they can retry). */
export function listCustomerOrders(customerId: string) {
  return prisma.order.findMany({
    where: { customerId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      totalPaise: true,
      createdAt: true,
      shop: { select: { name: true } },
      _count: { select: { items: true } },
    },
  });
}
