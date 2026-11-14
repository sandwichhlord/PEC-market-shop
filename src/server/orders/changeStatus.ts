// The single entry point for every order status change (CLAUDE.md conventions). It validates the move with the
// state machine, guards against concurrent changes, writes the OrderEvent, creates Notifications and, once the
// transaction has committed, pushes the change to connected browsers.
import type { OrderStatus, PaymentStatus } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { InvalidTransitionError, transition, type TransitionActor } from "@/lib/order-state";
import { CUSTOMER_STATUS_MESSAGE, ORDER_STATUS_LABEL } from "@/lib/order-status";
import { prisma } from "@/server/db";
import { HttpError, notFound } from "@/server/http";
import { emit, emitNotifications } from "@/server/realtime/emit";

export interface StatusActor {
  /** The user making the change; null for the system (payment confirmations, webhooks). */
  id: string | null;
  role: TransitionActor;
}

export interface ChangeStatusInput {
  orderId: string;
  to: OrderStatus;
  actor: StatusActor;
  /** Free-text reason stored on the OrderEvent (e.g. a rejection reason). */
  note?: string;
  /** Payment fields that change together with the status (payments and refunds). */
  payment?: { paymentStatus?: PaymentStatus; stripePaymentId?: string; refundedPaise?: number };
  /** Restrict the change to orders currently in one of these statuses (e.g. kitchen actions never touch disputes). */
  onlyFrom?: readonly OrderStatus[];
  /** Replaces the customer's notification text for this change (e.g. a partial refund or a rejected request). */
  customerMessage?: string;
  /** Also tells the shop owner about this change (DISPUTE notification), e.g. an admin's decision on a dispute. */
  shopMessage?: string;
  /**
   * Extra writes that must commit or roll back together with the status change (complaint rows, refunded items).
   * Runs after the order row is updated; throwing aborts the whole change.
   */
  inTransaction?: (tx: Tx) => Promise<void>;
}

export interface ChangedOrder {
  id: string;
  orderNumber: string;
  shopId: string;
  customerId: string;
  fromStatus: OrderStatus;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
}

type Tx = Prisma.TransactionClient;

export const orderChangedError = () =>
  new HttpError(409, "ORDER_CHANGED", "This order was just updated by someone else. Refresh and try again.");

/** The status an order had before it entered REFUND_REQUESTED (from its most recent such event). */
export async function statusBeforeRefundRequest(tx: Tx, orderId: string): Promise<OrderStatus | null> {
  const event = await tx.orderEvent.findFirst({
    where: { orderId, toStatus: "REFUND_REQUESTED" },
    orderBy: { createdAt: "desc" },
    select: { fromStatus: true },
  });
  return event?.fromStatus ?? null;
}

interface NotificationContext {
  order: { id: string; orderNumber: string; customerId: string; shopOwnerId: string; itemCount: number };
  from: OrderStatus;
  to: OrderStatus;
  actor: StatusActor;
  /** Overrides the customer's notification body. */
  customerMessage?: string;
  /** Adds a DISPUTE notification for the shop owner with this body. */
  shopMessage?: string;
}

/** Who hears about a status change (SPEC §3/§4): the shop about new paid orders and disputes, the customer about the rest. */
export function notificationsFor({ order, from, to, actor, customerMessage, shopMessage }: NotificationContext): Prisma.NotificationCreateManyInput[] {
  const customerLink = `/orders/${order.id}`;
  const shopLink = `/shop/orders/${order.id}`;
  const out: Prisma.NotificationCreateManyInput[] = [];

  if (to === "PLACED_PAID") {
    out.push({
      userId: order.shopOwnerId,
      type: "NEW_ORDER",
      title: `New order ${order.orderNumber}`,
      body: `${order.itemCount} item(s) — paid online.`,
      link: shopLink,
    });
  }
  if (to === "REFUND_REQUESTED" || to === "COMPLAINT_FILED") {
    out.push({
      userId: order.shopOwnerId,
      type: "DISPUTE",
      title: `${to === "REFUND_REQUESTED" ? "Refund requested" : "Complaint filed"} on ${order.orderNumber}`,
      body: "The customer needs a response. Open the order to review it.",
      link: shopLink,
    });
  }
  if (shopMessage && actor.id !== order.shopOwnerId) {
    out.push({ userId: order.shopOwnerId, type: "DISPUTE", title: `Order ${order.orderNumber}`, body: shopMessage, link: shopLink });
  }

  if (actor.id !== order.customerId) {
    const resumed = from === "REFUND_REQUESTED" && to !== "REFUNDED";
    const body =
      customerMessage ??
      (resumed ? `Your refund request was reviewed. The order continues: ${ORDER_STATUS_LABEL[to]}.` : CUSTOMER_STATUS_MESSAGE[to]);
    if (body) {
      out.push({
        userId: order.customerId,
        type: resumed ? "DISPUTE" : "ORDER_STATUS",
        title: `Order ${order.orderNumber}`,
        body,
        link: customerLink,
      });
    }
  }
  return out;
}

/**
 * Moves an order to `to`. Throws 404 for an unknown order, the state machine's 409/403 errors for a disallowed move,
 * and 409 ORDER_CHANGED if the order's status changed between reading and writing it.
 */
export async function changeStatus(input: ChangeStatusInput): Promise<ChangedOrder> {
  const { orderId, to, actor, note, payment, onlyFrom, customerMessage, shopMessage, inTransaction } = input;
  const outcome = await prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        paymentStatus: true,
        shopId: true,
        customerId: true,
        shop: { select: { ownerId: true } },
        _count: { select: { items: true } },
      },
    });
    if (!order) throw notFound("Order not found.");

    const from = order.status;
    if (onlyFrom && !onlyFrom.includes(from)) {
      throw new InvalidTransitionError(from, to, actor.role, `This action is not available while the order is ${ORDER_STATUS_LABEL[from].toLowerCase()}.`);
    }
    const previousStatus = from === "REFUND_REQUESTED" ? await statusBeforeRefundRequest(tx, orderId) : null;
    transition(from, to, actor.role, { previousStatus });

    // Conditional update: only succeeds if nobody changed the status since we read it.
    const { count } = await tx.order.updateMany({
      where: { id: orderId, status: from },
      data: { status: to, ...payment },
    });
    if (count === 0) throw orderChangedError();
    if (inTransaction) await inTransaction(tx);

    await tx.orderEvent.create({ data: { orderId, fromStatus: from, toStatus: to, actorId: actor.id, note: note ?? null } });
    const notifications = notificationsFor({
      order: {
        id: order.id,
        orderNumber: order.orderNumber,
        customerId: order.customerId,
        shopOwnerId: order.shop.ownerId,
        itemCount: order._count.items,
      },
      from,
      to,
      actor,
      customerMessage,
      shopMessage,
    });
    const created =
      notifications.length > 0
        ? await tx.notification.createManyAndReturn({
            data: notifications,
            select: { id: true, userId: true, type: true, title: true, body: true, link: true, createdAt: true },
          })
        : [];

    const result: ChangedOrder = {
      id: order.id,
      orderNumber: order.orderNumber,
      shopId: order.shopId,
      customerId: order.customerId,
      fromStatus: from,
      status: to,
      paymentStatus: payment?.paymentStatus ?? order.paymentStatus,
    };
    return { result, created };
  });

  const { result: changed, created } = outcome;
  const { id, ...rest } = changed;
  emit({ type: "order:status", orderId: id, ...rest });
  emitNotifications(created);
  return changed;
}
