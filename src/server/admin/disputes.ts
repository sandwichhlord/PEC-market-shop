// Admin side of disputes (SPEC §6): every refund request and complaint, filterable by status / shop / type; force a
// refund (chosen items or everything not refunded yet) through the payment provider; resolve with a note.
//
// The admin acts on OPEN disputes (still with the shop) and ESCALATED ones (a shop rejected the refund and the order
// resumed). An OPEN dispute drives the order's status (REFUND_REQUESTED / COMPLAINT_FILED), so closing it moves the
// order on; an ESCALATED one does not, so only a full refund changes the order's status (→ REFUNDED).
import type { Prisma } from "@/generated/prisma/client";
import type { ComplaintStatus, OrderStatus, PaymentStatus } from "@/generated/prisma/enums";
import { formatPaise } from "@/lib/money";
import { ADMIN_FORCE_REFUND_FROM, OrderTransitionError } from "@/lib/order-state";
import { ORDER_STATUS_LABEL } from "@/lib/order-status";
import type { AdminDisputeAction, DisputeListQuery } from "@/lib/validation/admin";
import { prisma } from "@/server/db";
import { HttpError, badRequest, notFound } from "@/server/http";
import { changeStatus, statusBeforeRefundRequest, type StatusActor } from "@/server/orders/changeStatus";
import { getPaymentProvider } from "@/server/payments";
import type { PaymentProvider } from "@/server/payments/types";
import { emit, emitNotifications } from "@/server/realtime/emit";
import { NOTIFICATION_SELECT } from "./accounts";

type Tx = Prisma.TransactionClient;

const ACTIVE: ComplaintStatus[] = ["OPEN", "ESCALATED"];
const DISPUTE_ORDER_STATUSES: OrderStatus[] = ["REFUND_REQUESTED", "COMPLAINT_FILED"];

const LIST_SELECT = {
  id: true,
  type: true,
  status: true,
  description: true,
  itemIds: true,
  refundAmountPaise: true,
  shopResponse: true,
  resolution: true,
  createdAt: true,
  updatedAt: true,
  raisedBy: { select: { id: true, name: true, email: true } },
  order: {
    select: {
      id: true,
      orderNumber: true,
      status: true,
      paymentStatus: true,
      totalPaise: true,
      refundedPaise: true,
      shop: { select: { id: true, name: true } },
      items: { orderBy: { nameAtOrder: "asc" }, select: { id: true, nameAtOrder: true, quantity: true, pricePaiseAtOrder: true, refunded: true } },
    },
  },
} as const;

/** The disputes queue. "active" (default) = OPEN + ESCALATED, escalated first then oldest first; others newest first. */
export function listDisputes({ status, shopId, type }: DisputeListQuery) {
  const where: Prisma.ComplaintWhereInput = {
    ...(status === "active" ? { status: { in: ACTIVE } } : status === "all" ? {} : { status }),
    ...(shopId ? { order: { shopId } } : {}),
    ...(type ? { type } : {}),
  };
  return prisma.complaint.findMany({
    where,
    orderBy: status === "active" ? [{ status: "desc" }, { createdAt: "asc" }] : [{ createdAt: "desc" }],
    take: 200,
    select: LIST_SELECT,
  });
}

export type AdminDispute = Awaited<ReturnType<typeof listDisputes>>[number];

/** One dispute with its order's items, payment and timeline (admin detail page). */
export function getAdminDispute(complaintId: string) {
  return prisma.complaint.findUnique({
    where: { id: complaintId },
    select: {
      ...LIST_SELECT,
      order: {
        select: {
          ...LIST_SELECT.order.select,
          createdAt: true,
          stripePaymentId: true,
          customer: { select: { id: true, name: true, email: true, status: true } },
          events: {
            orderBy: { createdAt: "asc" },
            select: { id: true, fromStatus: true, toStatus: true, note: true, createdAt: true, actor: { select: { name: true, role: true } } },
          },
        },
      },
    },
  });
}

export type AdminDisputeDetail = NonNullable<Awaited<ReturnType<typeof getAdminDispute>>>;

// ---- Actions ----

const ACTION_SELECT = {
  id: true,
  type: true,
  status: true,
  itemIds: true,
  resolution: true,
  order: {
    select: {
      id: true,
      orderNumber: true,
      status: true,
      totalPaise: true,
      refundedPaise: true,
      stripePaymentId: true,
      customerId: true,
      shopId: true,
      shop: { select: { ownerId: true } },
      items: { select: { id: true, nameAtOrder: true, quantity: true, pricePaiseAtOrder: true, refunded: true } },
    },
  },
} as const;

type ActionDispute = NonNullable<Awaited<ReturnType<typeof loadForAction>>>;

function loadForAction(complaintId: string) {
  return prisma.complaint.findUnique({ where: { id: complaintId }, select: ACTION_SELECT });
}

export interface AdminDisputeResult {
  complaint: { id: string; status: ComplaintStatus; resolution: string | null };
  order: { id: string; status: OrderStatus; paymentStatus: PaymentStatus; refundedPaise: number };
}

async function result(complaintId: string): Promise<AdminDisputeResult> {
  const c = await prisma.complaint.findUniqueOrThrow({
    where: { id: complaintId },
    select: { id: true, status: true, resolution: true, order: { select: { id: true, status: true, paymentStatus: true, refundedPaise: true } } },
  });
  return { complaint: { id: c.id, status: c.status, resolution: c.resolution }, order: c.order };
}

const closedError = () => new HttpError(409, "DISPUTE_CLOSED", "This dispute has already been closed.");

/** Throws unless the dispute can be acted on now. An ESCALATED dispute must wait while the order has an open one. */
function assertActionable(c: ActionDispute) {
  if (!ACTIVE.includes(c.status)) throw closedError();
  const expected = c.type === "REFUND" ? "REFUND_REQUESTED" : "COMPLAINT_FILED";
  if (c.status === "OPEN" && c.order.status !== expected) {
    throw new HttpError(409, "DISPUTE_INCONSISTENT", "This dispute does not match the order's current status.");
  }
  if (c.status === "ESCALATED" && DISPUTE_ORDER_STATUSES.includes(c.order.status)) {
    throw new HttpError(409, "ORDER_IN_DISPUTE", "This order has another open refund request or complaint. Handle that one first.");
  }
}

async function previousStatusOf(orderId: string): Promise<OrderStatus> {
  const previous = await statusBeforeRefundRequest(prisma, orderId);
  if (!previous) throw new HttpError(409, "DISPUTE_INCONSISTENT", "Could not tell which status this order had before the refund request.");
  return previous;
}

/** Thrown inside a transaction when the conditional claim finds the dispute already handled by someone else. */
class AlreadyHandled extends Error {}

async function claim(tx: Tx, c: ActionDispute, data: { status: ComplaintStatus; resolution: string }) {
  const { count } = await tx.complaint.updateMany({ where: { id: c.id, status: c.status }, data });
  if (count === 0) throw new AlreadyHandled();
}

/**
 * Records a change that leaves the order's status alone (escalated disputes): payment fields, refunded items,
 * notifications for the customer and the shop, and a refresh push. Conditional on the order's status and refunded
 * amount so a concurrent change aborts it.
 */
async function updateWithoutStatusChange(
  c: ActionDispute,
  opts: {
    payment?: { paymentStatus: PaymentStatus; refundedPaise: number };
    customerMessage: string;
    shopMessage: string;
    inTransaction: (tx: Tx) => Promise<void>;
    /** The order's status and refunded amount as just read (defaults to the dispute's snapshot). */
    current?: { status: OrderStatus; refundedPaise: number };
  },
) {
  const order = { ...c.order, ...opts.current };
  const { created, paymentStatus } = await prisma.$transaction(async (tx) => {
    const { count } = await tx.order.updateMany({
      where: { id: order.id, status: order.status, refundedPaise: order.refundedPaise },
      data: opts.payment ?? {},
    });
    if (count === 0) throw new HttpError(409, "ORDER_CHANGED", "This order was just updated by someone else. Refresh and try again.");
    await opts.inTransaction(tx);
    const created = await tx.notification.createManyAndReturn({
      data: [
        { userId: order.customerId, type: "DISPUTE", title: `Order ${order.orderNumber}`, body: opts.customerMessage, link: `/orders/${order.id}` },
        { userId: order.shop.ownerId, type: "DISPUTE", title: `Order ${order.orderNumber}`, body: opts.shopMessage, link: `/shop/orders/${order.id}` },
      ],
      select: NOTIFICATION_SELECT,
    });
    const { paymentStatus } = await tx.order.findUniqueOrThrow({ where: { id: order.id }, select: { paymentStatus: true } });
    return { created, paymentStatus };
  });
  // Same status on both sides: tells open pages (customer, shop, admin) to refresh.
  emit({
    type: "order:status",
    orderId: order.id,
    orderNumber: order.orderNumber,
    shopId: order.shopId,
    customerId: order.customerId,
    fromStatus: order.status,
    status: order.status,
    paymentStatus,
  });
  emitNotifications(created);
}

/** Force refund: the chosen items (or every item not refunded yet), via the provider, then closes the dispute RESOLVED. */
async function forceRefund(
  c: ActionDispute,
  actor: StatusActor,
  action: Extract<AdminDisputeAction, { action: "refund" }>,
  provider: PaymentProvider,
): Promise<AdminDisputeResult> {
  assertActionable(c);
  const order = c.order;
  const byId = new Map(order.items.map((i) => [i.id, i]));
  const items = action.wholeOrder
    ? order.items.filter((i) => !i.refunded)
    : action.itemIds.map((id) => {
        const item = byId.get(id);
        if (!item) throw badRequest("One of the chosen items is not part of this order.");
        if (item.refunded) throw new HttpError(409, "ALREADY_REFUNDED", "One of the chosen items has already been refunded.");
        return item;
      });
  const amountPaise = items.reduce((sum, i) => sum + i.pricePaiseAtOrder * i.quantity, 0);
  const refundablePaise = order.totalPaise - order.refundedPaise;
  if (items.length === 0 || amountPaise <= 0) throw new HttpError(409, "NOTHING_TO_REFUND", "Everything in this order has already been refunded.");
  if (amountPaise > refundablePaise) {
    throw new HttpError(409, "REFUND_EXCEEDS_PAID", `Only ${formatPaise(refundablePaise)} of this order can still be refunded.`, {
      requestedPaise: amountPaise,
      refundablePaise,
    });
  }
  if (!order.stripePaymentId) throw new HttpError(409, "NO_PAYMENT", "This order has no recorded payment to refund.");

  const names = items.map((i) => `${i.quantity}× ${i.nameAtOrder}`).join(", ");
  const resolution = `Refunded ${formatPaise(amountPaise)} by the market admin (${names}). ${action.note}`;

  // Claim first so a repeated or concurrent force refund cannot refund twice.
  const claimed = await prisma.complaint.updateMany({ where: { id: c.id, status: c.status }, data: { status: "RESOLVED", resolution } });
  if (claimed.count === 0) throw closedError();
  try {
    await provider.refund({ paymentId: order.stripePaymentId, amountPaise, idempotencyKey: `admin-refund-${c.id}` });
  } catch (err) {
    await prisma.complaint.update({ where: { id: c.id }, data: { status: c.status, resolution: c.resolution } });
    console.error(`[refunds] admin force refund failed for order ${order.orderNumber}`, err);
    throw new HttpError(502, "REFUND_FAILED", "The payment provider could not issue the refund. Please try again.");
  }

  // The money has moved: record it against whatever state the order is in now. An escalated dispute's order is back
  // in the kitchen flow and the shop may move it while the provider call runs, so a concurrent change is retried.
  await recordRefund(c, actor, { items, amountPaise, names, note: action.note });
  return result(c.id);
}

/** Gives up after this many conflicting concurrent changes (each retry re-reads the order). */
const RECORD_ATTEMPTS = 5;

async function recordRefund(
  c: ActionDispute,
  actor: StatusActor,
  refund: { items: { id: string }[]; amountPaise: number; names: string; note: string },
) {
  const { items, amountPaise, names, note } = refund;
  const markItems = async (tx: Tx) => {
    await tx.orderItem.updateMany({ where: { id: { in: items.map((i) => i.id) } }, data: { refunded: true } });
  };
  const customerMessage = `The market admin refunded ${formatPaise(amountPaise)} (${names}). Note: “${note}”`;
  const shopMessage = `The market admin refunded ${formatPaise(amountPaise)} on this order (${names}).`;

  for (let attempt = 1; ; attempt++) {
    const current = await prisma.order.findUniqueOrThrow({ where: { id: c.order.id }, select: { status: true, refundedPaise: true, totalPaise: true } });
    // A Stripe `charge.refunded` echo may already have counted this refund; never count it twice.
    const refundedPaise = Math.min(current.totalPaise, Math.max(current.refundedPaise, c.order.refundedPaise + amountPaise));
    const full = refundedPaise >= current.totalPaise;
    const payment = { paymentStatus: (full ? "REFUNDED" : "PARTIALLY_REFUNDED") as PaymentStatus, refundedPaise };

    // Where the order goes: null = stays where it is (escalated dispute, partial refund or a terminal order).
    let to: OrderStatus | null = null;
    if (c.status === "OPEN" && c.type === "REFUND" && current.status === "REFUND_REQUESTED") {
      to = full ? "REFUNDED" : await previousStatusOf(c.order.id);
    } else if (c.status === "OPEN" && c.type === "COMPLAINT" && current.status === "COMPLAINT_FILED") {
      to = full ? "REFUNDED" : "RESOLVED";
    } else if (full && (ADMIN_FORCE_REFUND_FROM as readonly OrderStatus[]).includes(current.status)) {
      to = "REFUNDED";
    }

    try {
      if (to) {
        await changeStatus({
          orderId: c.order.id,
          to,
          actor,
          note: `Admin refund of ${formatPaise(amountPaise)} (${names}): ${note}`,
          payment,
          onlyFrom: [current.status],
          customerMessage: to === "REFUNDED" || to === "RESOLVED" ? customerMessage : `${customerMessage} Your order continues: ${ORDER_STATUS_LABEL[to]}.`,
          shopMessage,
          inTransaction: markItems,
        });
      } else {
        await updateWithoutStatusChange(c, { payment, customerMessage, shopMessage, inTransaction: markItems, current });
      }
      return;
    } catch (err) {
      const conflict = (err instanceof HttpError && err.code === "ORDER_CHANGED") || err instanceof OrderTransitionError;
      if (!conflict || attempt >= RECORD_ATTEMPTS) {
        console.error(`[refunds] admin refund of ${formatPaise(amountPaise)} on order ${c.order.orderNumber} was issued but could not be recorded`, err);
        throw err;
      }
    }
  }
}
/**
 * Resolves without (further) refund. OPEN refund request → order resumes its previous status, request REJECTED.
 * OPEN complaint → order RESOLVED, complaint RESOLVED. ESCALATED refund request → REJECTED, order unchanged.
 */
async function resolveDispute(c: ActionDispute, actor: StatusActor, note: string): Promise<AdminDisputeResult> {
  assertActionable(c);
  const order = c.order;
  const closedAs: ComplaintStatus = c.type === "REFUND" ? "REJECTED" : "RESOLVED";
  const customerMessage =
    c.type === "REFUND" ? `The market admin reviewed your refund request and closed it without a refund: “${note}”` : `The market admin resolved your complaint: “${note}”`;
  const shopMessage = `The market admin closed the ${c.type === "REFUND" ? "refund request" : "complaint"} on this order: “${note}”`;
  const claimIt = (tx: Tx) => claim(tx, c, { status: closedAs, resolution: note });
  try {
    if (c.status === "OPEN") {
      const to = c.type === "REFUND" ? await previousStatusOf(order.id) : "RESOLVED";
      await changeStatus({
        orderId: order.id,
        to,
        actor,
        note: `Admin: ${note}`,
        payment: c.type === "REFUND" ? { paymentStatus: order.refundedPaise > 0 ? "PARTIALLY_REFUNDED" : "PAID" } : undefined,
        onlyFrom: [order.status],
        customerMessage: c.type === "REFUND" ? `${customerMessage} Your order continues: ${ORDER_STATUS_LABEL[to]}.` : customerMessage,
        shopMessage,
        inTransaction: claimIt,
      });
    } else {
      await updateWithoutStatusChange(c, { customerMessage, shopMessage, inTransaction: claimIt });
    }
  } catch (err) {
    if (err instanceof AlreadyHandled) throw closedError();
    throw err;
  }
  return result(c.id);
}

/** An admin's action on any dispute. */
export async function adminDisputeAction(
  complaintId: string,
  actor: StatusActor,
  action: AdminDisputeAction,
  /** Tests pass a fake; otherwise the configured provider (resolved only when a refund is issued). */
  provider?: PaymentProvider,
): Promise<AdminDisputeResult> {
  const c = await loadForAction(complaintId);
  if (!c) throw notFound("Dispute not found.");
  return action.action === "refund" ? forceRefund(c, actor, action, provider ?? getPaymentProvider()) : resolveDispute(c, actor, action.note);
}
