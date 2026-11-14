// A shop's orders dashboard. Only paid orders are ever shown to a shop (unpaid checkouts never reach it).
// Callers have checked ownership of `shopId`; queries are scoped by it so other shops' orders are "not found".
import {
  KITCHEN_STATUSES,
  SHOP_ORDER_FILTERS,
  SHOP_VISIBLE_STATUSES,
  type KitchenTarget,
  type ShopOrderFilter,
} from "@/lib/order-status";
import { prisma } from "@/server/db";
import { notFound } from "@/server/http";
import { changeStatus, type StatusActor } from "@/server/orders/changeStatus";

const ORDER_SUMMARY_SELECT = {
  id: true,
  orderNumber: true,
  status: true,
  paymentStatus: true,
  totalPaise: true,
  refundedPaise: true,
  createdAt: true,
  customer: { select: { name: true } },
  items: { orderBy: { nameAtOrder: "asc" }, select: { id: true, nameAtOrder: true, quantity: true } },
} as const;

/** Orders in one dashboard filter. Active orders oldest first (kitchen queue); the others newest first. */
export async function listShopOrders(shopId: string, filter: ShopOrderFilter) {
  return prisma.order.findMany({
    where: { shopId, status: { in: [...SHOP_ORDER_FILTERS[filter]] } },
    orderBy: { createdAt: filter === "active" ? "asc" : "desc" },
    take: 100,
    select: ORDER_SUMMARY_SELECT,
  });
}

export type ShopOrderSummary = Awaited<ReturnType<typeof listShopOrders>>[number];

/** Number of orders in each dashboard filter (tab badges). */
export async function countShopOrders(shopId: string): Promise<Record<ShopOrderFilter, number>> {
  const rows = await prisma.order.groupBy({
    by: ["status"],
    where: { shopId, status: { in: [...SHOP_VISIBLE_STATUSES] } },
    _count: { _all: true },
  });
  const byStatus = new Map(rows.map((r) => [r.status, r._count._all]));
  const count = (filter: ShopOrderFilter) =>
    SHOP_ORDER_FILTERS[filter].reduce((sum: number, s) => sum + (byStatus.get(s) ?? 0), 0);
  return { active: count("active"), completed: count("completed"), disputes: count("disputes") };
}

/** One of the shop's paid orders with items, customer, timeline and disputes, or null. */
export function findShopOrder(shopId: string, orderId: string) {
  return prisma.order.findFirst({
    where: { id: orderId, shopId, status: { in: [...SHOP_VISIBLE_STATUSES] } },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      paymentStatus: true,
      totalPaise: true,
      refundedPaise: true,
      createdAt: true,
      customer: { select: { name: true, phone: true } },
      items: {
        orderBy: { nameAtOrder: "asc" },
        select: { id: true, nameAtOrder: true, quantity: true, pricePaiseAtOrder: true, refunded: true },
      },
      events: {
        orderBy: { createdAt: "asc" },
        select: { id: true, fromStatus: true, toStatus: true, note: true, createdAt: true, actor: { select: { name: true, role: true } } },
      },
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
    },
  });
}

export type ShopOrderDetail = NonNullable<Awaited<ReturnType<typeof findShopOrder>>>;

/** Like findShopOrder, but a missing order is a 404 HttpError (API routes). */
export async function getShopOrder(shopId: string, orderId: string): Promise<ShopOrderDetail> {
  const order = await findShopOrder(shopId, orderId);
  if (!order) throw notFound("Order not found.");
  return order;
}

/** A kitchen action from the dashboard (start preparing / ready / completed) on one of the shop's orders. */
export async function advanceShopOrder(shopId: string, orderId: string, to: KitchenTarget, actor: StatusActor) {
  const order = await prisma.order.findFirst({
    where: { id: orderId, shopId, status: { in: [...SHOP_VISIBLE_STATUSES] } },
    select: { id: true },
  });
  if (!order) throw notFound("Order not found.");
  return changeStatus({ orderId, to, actor, onlyFrom: KITCHEN_STATUSES });
}
