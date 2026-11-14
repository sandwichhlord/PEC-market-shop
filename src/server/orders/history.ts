// A customer's order history (SPEC §3): the Active / Past lists and one order's detail with its tracking timeline.
// Every query is scoped by customerId, so another customer's order is simply "not found".
import type { OrderStatus } from "@/generated/prisma/enums";
import { CUSTOMER_ORDER_TABS, CUSTOMER_ORDER_TAB_NAMES, type CustomerOrderTab } from "@/lib/order-status";
import { readyEstimate, trackingSteps } from "@/lib/order-tracking";
import { prisma } from "@/server/db";

/** A customer's orders in one history tab, newest first (capped at 100). */
export function listCustomerOrders(customerId: string, tab: CustomerOrderTab) {
  return prisma.order.findMany({
    where: { customerId, status: { in: [...CUSTOMER_ORDER_TABS[tab]] } },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      orderNumber: true,
      status: true,
      totalPaise: true,
      createdAt: true,
      shop: { select: { name: true, logoUrl: true } },
      items: { orderBy: { nameAtOrder: "asc" }, select: { id: true, nameAtOrder: true, quantity: true } },
    },
  });
}

export type CustomerOrderListItem = Awaited<ReturnType<typeof listCustomerOrders>>[number];

/** Number of the customer's orders in each history tab (tab badges). */
export async function countCustomerOrders(customerId: string): Promise<Record<CustomerOrderTab, number>> {
  const rows = await prisma.order.groupBy({ by: ["status"], where: { customerId }, _count: { _all: true } });
  const byStatus = new Map<OrderStatus, number>(rows.map((r) => [r.status, r._count._all]));
  const counts = {} as Record<CustomerOrderTab, number>;
  for (const tab of CUSTOMER_ORDER_TAB_NAMES) {
    counts[tab] = CUSTOMER_ORDER_TABS[tab].reduce((sum: number, s) => sum + (byStatus.get(s) ?? 0), 0);
  }
  return counts;
}

const ORDER_DETAIL_SELECT = {
  id: true,
  orderNumber: true,
  status: true,
  paymentStatus: true,
  totalPaise: true,
  refundedPaise: true,
  createdAt: true,
  updatedAt: true,
  customerId: true,
  shop: { select: { id: true, name: true, location: true, logoUrl: true } },
  items: {
    orderBy: { nameAtOrder: "asc" },
    select: {
      id: true,
      nameAtOrder: true,
      quantity: true,
      pricePaiseAtOrder: true,
      refunded: true,
      menuItem: { select: { prepTimeMinutes: true } },
    },
  },
  events: {
    orderBy: { createdAt: "asc" },
    select: { id: true, fromStatus: true, toStatus: true, note: true, createdAt: true, actor: { select: { name: true, role: true } } },
  },
  review: { select: { id: true, rating: true, comment: true, photos: true, createdAt: true } },
  complaints: {
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      type: true,
      status: true,
      description: true,
      itemIds: true,
      refundAmountPaise: true,
      shopResponse: true,
      resolution: true,
      createdAt: true,
    },
  },
} as const;

/** Loads an order's detail and adds the tracking steps and estimated ready time derived from its events. */
async function loadOrderDetail(where: { id: string; customerId?: string }) {
  const order = await prisma.order.findFirst({ where, select: ORDER_DETAIL_SELECT });
  if (!order) return null;
  const { items, ...rest } = order;
  return {
    ...rest,
    items: items.map(({ menuItem, ...item }) => ({ ...item, prepTimeMinutes: menuItem.prepTimeMinutes })),
    steps: trackingSteps(order.status, order.events),
    estimate: readyEstimate(order.status, order.events, items.map((i) => i.menuItem)),
  };
}

/** One of the customer's own orders with items, timeline, tracking steps and ready estimate, or null if not theirs. */
export function getCustomerOrderDetail(orderId: string, customerId: string) {
  return loadOrderDetail({ id: orderId, customerId });
}

/** An order's detail without an ownership filter — callers must have checked access (requireOrderAccess). */
export function getOrderDetail(orderId: string) {
  return loadOrderDetail({ id: orderId });
}

export type CustomerOrderDetail = NonNullable<Awaited<ReturnType<typeof getCustomerOrderDetail>>>;

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
