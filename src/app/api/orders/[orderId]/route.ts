import { NextResponse } from "next/server";
import { SHOP_VISIBLE_STATUSES } from "@/lib/order-status";
import { orderIdSchema } from "@/lib/validation/checkout";
import { requireOrderAccess } from "@/server/auth/guards";
import { notFound, withErrors } from "@/server/http";
import { getOrderDetail } from "@/server/orders/history";

/**
 * GET /api/orders/:orderId → { order } with items, timeline (OrderEvents), tracking steps and ready estimate.
 * Its customer, its shop's owner (paid orders only — unpaid checkouts never reach the shop) or an admin;
 * anyone else gets 404.
 */
export const GET = withErrors(async (req: Request, ctx: { params: Promise<{ orderId: string }> }) => {
  const { orderId } = orderIdSchema.parse(await ctx.params);
  const { order: row, access } = await requireOrderAccess(req, orderId);
  if (access === "shop" && !SHOP_VISIBLE_STATUSES.includes(row.status)) throw notFound("Order not found.");
  const order = await getOrderDetail(orderId);
  if (!order) throw notFound("Order not found.");
  return NextResponse.json({ order });
});
