// Customer side of disputes (SPEC §6): refund requests (chosen items or the whole order) and complaints. Each one
// creates its Complaint row in the same transaction as the order's status change, so they can never disagree.
import type { OrderStatus } from "@/generated/prisma/enums";
import { COMPLAINABLE_STATUSES, RESUMABLE_STATUSES } from "@/lib/order-state";
import type { RefundRequestInput } from "@/lib/validation/disputes";
import { prisma } from "@/server/db";
import { HttpError, badRequest, notFound } from "@/server/http";
import { changeStatus } from "@/server/orders/changeStatus";

const CUSTOMER = "CUSTOMER" as const;

async function loadOwnOrder(orderId: string, customerId: string) {
  const order = await prisma.order.findFirst({
    where: { id: orderId, customerId },
    select: { id: true, status: true, items: { select: { id: true, quantity: true, pricePaiseAtOrder: true, refunded: true } } },
  });
  if (!order) throw notFound("Order not found.");
  return order;
}

const isIn = (status: OrderStatus, list: readonly OrderStatus[]) => list.includes(status);

/**
 * Asks the shop to refund some items (or every item not refunded yet). Allowed while the order is placed, preparing or
 * ready for pickup. The requested amount is the sum of the chosen items' price at order × quantity.
 */
export async function requestRefund(orderId: string, customerId: string, input: RefundRequestInput) {
  const order = await loadOwnOrder(orderId, customerId);
  if (!isIn(order.status, RESUMABLE_STATUSES)) {
    throw new HttpError(409, "REFUND_NOT_AVAILABLE", "Refunds can be requested only while the order is placed, being prepared or ready for pickup.");
  }

  const byId = new Map(order.items.map((i) => [i.id, i]));
  const chosen = input.wholeOrder
    ? order.items.filter((i) => !i.refunded)
    : input.itemIds.map((id) => {
        const item = byId.get(id);
        if (!item) throw badRequest("One of the chosen items is not part of this order.");
        if (item.refunded) throw new HttpError(409, "ALREADY_REFUNDED", "One of the chosen items has already been refunded.");
        return item;
      });
  if (chosen.length === 0) throw new HttpError(409, "NOTHING_TO_REFUND", "Every item in this order has already been refunded.");
  const refundAmountPaise = chosen.reduce((sum, i) => sum + i.pricePaiseAtOrder * i.quantity, 0);

  let complaintId = "";
  const changed = await changeStatus({
    orderId,
    to: "REFUND_REQUESTED",
    actor: { id: customerId, role: CUSTOMER },
    note: input.reason,
    payment: { paymentStatus: "REFUND_REQUESTED" },
    onlyFrom: RESUMABLE_STATUSES,
    inTransaction: async (tx) => {
      const complaint = await tx.complaint.create({
        data: {
          orderId,
          raisedById: customerId,
          type: "REFUND",
          description: input.reason,
          itemIds: chosen.map((i) => i.id),
          refundAmountPaise,
        },
        select: { id: true },
      });
      complaintId = complaint.id;
    },
  });
  return { complaintId, refundAmountPaise, order: { status: changed.status, paymentStatus: changed.paymentStatus } };
}

/** Files a free-text complaint about a paid order (placed … completed). */
export async function fileComplaint(orderId: string, customerId: string, description: string) {
  const order = await loadOwnOrder(orderId, customerId);
  if (!isIn(order.status, COMPLAINABLE_STATUSES)) {
    throw new HttpError(409, "COMPLAINT_NOT_AVAILABLE", "A complaint can't be filed for this order right now.");
  }
  let complaintId = "";
  const changed = await changeStatus({
    orderId,
    to: "COMPLAINT_FILED",
    actor: { id: customerId, role: CUSTOMER },
    onlyFrom: COMPLAINABLE_STATUSES,
    inTransaction: async (tx) => {
      const complaint = await tx.complaint.create({
        data: { orderId, raisedById: customerId, type: "COMPLAINT", description, itemIds: [] },
        select: { id: true },
      });
      complaintId = complaint.id;
    },
  });
  return { complaintId, order: { status: changed.status, paymentStatus: changed.paymentStatus } };
}
