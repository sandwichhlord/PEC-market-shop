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

/** One of the customer's own orders with its items (checkout result pages), or null if it is not theirs. */
export function getCustomerOrderSummary(orderId: string, customerId: string) {
  return prisma.order.findFirst({
    where: { id: orderId, customerId },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      paymentStatus: true,
      totalPaise: true,
      shopId: true,
      shop: { select: { name: true } },
      items: { select: { id: true, nameAtOrder: true, quantity: true, pricePaiseAtOrder: true }, orderBy: { id: "asc" } },
    },
  });
}

export type CustomerOrderSummary = NonNullable<Awaited<ReturnType<typeof getCustomerOrderSummary>>>;
