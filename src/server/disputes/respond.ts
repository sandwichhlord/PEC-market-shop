// Responses to disputes (SPEC §6): approve a refund (provider refund, full or partial), reject it (escalates to the
// admin and the order resumes), reply to a complaint, or resolve it. Approve / reject / resolve claim the OPEN
// complaint with a conditional update, so repeating one (double click, two tabs) is a no-op, not a second refund.
import type { Prisma } from "@/generated/prisma/client";
import type { ComplaintStatus, OrderStatus, PaymentStatus } from "@/generated/prisma/enums";
import { formatPaise } from "@/lib/money";
import { ORDER_STATUS_LABEL } from "@/lib/order-status";
import type { DisputeAction } from "@/lib/validation/disputes";
import { prisma } from "@/server/db";
import { HttpError, notFound } from "@/server/http";
import { changeStatus, statusBeforeRefundRequest, type StatusActor } from "@/server/orders/changeStatus";
import { getPaymentProvider } from "@/server/payments";
import type { PaymentProvider } from "@/server/payments/types";
import { emitNotifications } from "@/server/realtime/emit";

const COMPLAINT_SELECT = {
  id: true,
  type: true,
  status: true,
  itemIds: true,
  shopResponse: true,
  resolution: true,
  order: {
    select: {
      id: true,
      orderNumber: true,
      status: true,
      paymentStatus: true,
      totalPaise: true,
      refundedPaise: true,
      stripePaymentId: true,
      customerId: true,
      shopId: true,
      items: { select: { id: true, nameAtOrder: true, quantity: true, pricePaiseAtOrder: true, refunded: true } },
    },
  },
} as const;

type LoadedComplaint = NonNullable<Awaited<ReturnType<typeof findComplaint>>>;

function findComplaint(complaintId: string, shopId?: string) {
  return prisma.complaint.findFirst({ where: { id: complaintId, ...(shopId ? { order: { shopId } } : {}) }, select: COMPLAINT_SELECT });
}

export interface DisputeResult {
  /** False when the dispute had already been handled this way (repeat request): nothing happened. */
  changed: boolean;
  complaint: { id: string; status: ComplaintStatus };
  order: { id: string; status: OrderStatus; paymentStatus: PaymentStatus; refundedPaise: number };
}

async function result(complaintId: string, changed: boolean): Promise<DisputeResult> {
  const c = await prisma.complaint.findUniqueOrThrow({
    where: { id: complaintId },
    select: { id: true, status: true, order: { select: { id: true, status: true, paymentStatus: true, refundedPaise: true } } },
  });
  return { changed, complaint: { id: c.id, status: c.status }, order: c.order };
}

const closedError = () => new HttpError(409, "DISPUTE_CLOSED", "This dispute has already been handled.");
const wrongType = (expected: "refund request" | "complaint") =>
  new HttpError(409, "WRONG_DISPUTE_TYPE", `This action only applies to a ${expected}.`);

/** Thrown inside a transaction when the conditional claim finds the complaint already handled. */
class AlreadyHandled extends Error {}

async function claimInTx(
  tx: Prisma.TransactionClient,
  complaintId: string,
  data: { status: ComplaintStatus; shopResponse?: string; resolution?: string | null },
) {
  const { count } = await tx.complaint.updateMany({ where: { id: complaintId, status: "OPEN" }, data });
  if (count === 0) throw new AlreadyHandled();
}

async function previousStatusOf(orderId: string): Promise<OrderStatus> {
  const previous = await statusBeforeRefundRequest(prisma, orderId);
  if (!previous) throw new HttpError(409, "DISPUTE_INCONSISTENT", "Could not tell which status this order had before the refund request.");
  return previous;
}

/**
 * Approves a refund request: refunds the requested items through the payment provider, marks them refunded and adds
 * the amount to `refundedPaise`. Fully refunded → REFUNDED / paymentStatus REFUNDED; otherwise the order resumes its
 * previous status with paymentStatus PARTIALLY_REFUNDED. The amount can never exceed what is still refundable.
 */
async function approveRefund(
  c: LoadedComplaint,
  actor: StatusActor,
  message: string | undefined,
  provider: PaymentProvider,
): Promise<DisputeResult> {
  if (c.type !== "REFUND") throw wrongType("refund request");
  if (c.status === "RESOLVED") return result(c.id, false);
  if (c.status !== "OPEN") throw closedError();
  const order = c.order;
  if (order.status !== "REFUND_REQUESTED") throw closedError();

  const items = order.items.filter((i) => c.itemIds.includes(i.id) && !i.refunded);
  const amountPaise = items.reduce((sum, i) => sum + i.pricePaiseAtOrder * i.quantity, 0);
  const refundablePaise = order.totalPaise - order.refundedPaise;
  if (amountPaise <= 0) throw new HttpError(409, "NOTHING_TO_REFUND", "These items have already been refunded.");
  if (amountPaise > refundablePaise) {
    throw new HttpError(409, "REFUND_EXCEEDS_PAID", `Only ${formatPaise(refundablePaise)} of this order can still be refunded.`, {
      requestedPaise: amountPaise,
      refundablePaise,
    });
  }
  if (!order.stripePaymentId) throw new HttpError(409, "NO_PAYMENT", "This order has no recorded payment to refund.");
  const refundedPaise = order.refundedPaise + amountPaise;
  const full = refundedPaise >= order.totalPaise;
  const to = full ? "REFUNDED" : await previousStatusOf(order.id);

  // Claim the request first so a second approval cannot issue a second refund.
  const response = message || "Refund approved.";
  const claimed = await prisma.complaint.updateMany({
    where: { id: c.id, status: "OPEN" },
    data: { status: "RESOLVED", shopResponse: response, resolution: `Refunded ${formatPaise(amountPaise)}.` },
  });
  if (claimed.count === 0) return result(c.id, false);

  try {
    await provider.refund({ paymentId: order.stripePaymentId, amountPaise, idempotencyKey: `refund-${c.id}` });
  } catch (err) {
    await prisma.complaint.update({ where: { id: c.id }, data: { status: "OPEN", shopResponse: c.shopResponse, resolution: c.resolution } });
    console.error(`[refunds] provider refund failed for order ${order.orderNumber}`, err);
    throw new HttpError(502, "REFUND_FAILED", "The payment provider could not issue the refund. Please try again.");
  }

  const names = items.map((i) => `${i.quantity}× ${i.nameAtOrder}`).join(", ");
  await changeStatus({
    orderId: order.id,
    to,
    actor,
    note: `Refund of ${formatPaise(amountPaise)} approved (${names}).`,
    payment: { paymentStatus: full ? "REFUNDED" : "PARTIALLY_REFUNDED", refundedPaise },
    onlyFrom: ["REFUND_REQUESTED"],
    customerMessage: full
      ? `Your refund of ${formatPaise(amountPaise)} has been issued.`
      : `A partial refund of ${formatPaise(amountPaise)} was issued for ${names}. Your order continues: ${ORDER_STATUS_LABEL[to]}.`,
    inTransaction: async (tx) => {
      await tx.orderItem.updateMany({ where: { id: { in: items.map((i) => i.id) } }, data: { refunded: true } });
    },
  });
  return result(c.id, true);
}

/** Rejects a refund request: the dispute escalates to the admin (ESCALATED) and the order resumes where it was. */
async function rejectRefund(c: LoadedComplaint, actor: StatusActor, reason: string): Promise<DisputeResult> {
  if (c.type !== "REFUND") throw wrongType("refund request");
  if (c.status === "ESCALATED") return result(c.id, false);
  if (c.status !== "OPEN" || c.order.status !== "REFUND_REQUESTED") throw closedError();
  const to = await previousStatusOf(c.order.id);
  try {
    await changeStatus({
      orderId: c.order.id,
      to,
      actor,
      note: `Refund request rejected: ${reason}`,
      payment: { paymentStatus: c.order.refundedPaise > 0 ? "PARTIALLY_REFUNDED" : "PAID" },
      onlyFrom: ["REFUND_REQUESTED"],
      customerMessage: `The shop declined your refund request: “${reason}”. The market admin will review it. Your order continues: ${ORDER_STATUS_LABEL[to]}.`,
      inTransaction: (tx) => claimInTx(tx, c.id, { status: "ESCALATED", shopResponse: reason }),
    });
  } catch (err) {
    if (err instanceof AlreadyHandled) return result(c.id, false);
    throw err;
  }
  return result(c.id, true);
}

/** Resolves a complaint: complaint RESOLVED (with an optional note), order COMPLAINT_FILED → RESOLVED. */
async function resolveComplaint(c: LoadedComplaint, actor: StatusActor, resolution: string | undefined): Promise<DisputeResult> {
  if (c.type !== "COMPLAINT") throw wrongType("complaint");
  if (c.status === "RESOLVED") return result(c.id, false);
  if (c.status !== "OPEN" || c.order.status !== "COMPLAINT_FILED") throw closedError();
  try {
    await changeStatus({
      orderId: c.order.id,
      to: "RESOLVED",
      actor,
      note: resolution || undefined,
      onlyFrom: ["COMPLAINT_FILED"],
      customerMessage: resolution ? `Your complaint has been resolved. Note from the shop: “${resolution}”` : undefined,
      inTransaction: (tx) => claimInTx(tx, c.id, { status: "RESOLVED", resolution: resolution || null }),
    });
  } catch (err) {
    if (err instanceof AlreadyHandled) return result(c.id, false);
    throw err;
  }
  return result(c.id, true);
}

/** Replies to an open complaint without closing it; the customer is notified. Not a status change. */
async function replyToComplaint(c: LoadedComplaint, message: string): Promise<DisputeResult> {
  if (c.type !== "COMPLAINT") throw wrongType("complaint");
  if (c.status !== "OPEN") throw closedError();
  const preview = message.length > 160 ? `${message.slice(0, 157)}…` : message;
  const notification = await prisma.$transaction(async (tx) => {
    const { count } = await tx.complaint.updateMany({ where: { id: c.id, status: "OPEN" }, data: { shopResponse: message } });
    if (count === 0) throw closedError();
    return tx.notification.create({
      data: {
        userId: c.order.customerId,
        type: "DISPUTE",
        title: `Order ${c.order.orderNumber}`,
        body: `The shop replied to your complaint: “${preview}”`,
        link: `/orders/${c.order.id}`,
      },
      select: { id: true, userId: true, type: true, title: true, body: true, link: true, createdAt: true },
    });
  });
  emitNotifications([notification]);
  return result(c.id, true);
}

/** A shop owner's response to one of its shop's disputes. Other shops' disputes are "not found". */
export async function respondToDispute(
  shopId: string,
  complaintId: string,
  actor: StatusActor,
  action: DisputeAction,
  /** Tests pass a fake; otherwise the configured provider (resolved only when a refund is issued). */
  provider?: PaymentProvider,
): Promise<DisputeResult> {
  const c = await findComplaint(complaintId, shopId);
  if (!c) throw notFound("Dispute not found.");
  switch (action.action) {
    case "approve":
      return approveRefund(c, actor, action.message, provider ?? getPaymentProvider());
    case "reject":
      return rejectRefund(c, actor, action.reason);
    case "reply":
      return replyToComplaint(c, action.message);
    case "resolve":
      return resolveComplaint(c, actor, action.resolution);
  }
}
