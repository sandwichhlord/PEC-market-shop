// Server → browser push. Business logic calls `emit()` after its database writes commit; this module decides which
// Socket.IO rooms hear about it. Rooms: user:<id>, shop:<id>, order:<id>, admin, and the public menu:<shopId>.
// Without a running Socket.IO server (unit tests, scripts) emitting is a no-op.
import type { NotificationType, OrderStatus, PaymentStatus } from "@/generated/prisma/enums";
import { getIO } from "./io";

export interface OrderStatusEvent {
  type: "order:status";
  orderId: string;
  orderNumber: string;
  shopId: string;
  customerId: string;
  fromStatus: OrderStatus;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
}

export interface MenuItemEvent {
  type: "menu:item";
  shopId: string;
  itemId: string;
  inStock: boolean;
  archived: boolean;
}

export interface ShopUpdatedEvent {
  type: "shop:updated";
  shopId: string;
  isOpen: boolean;
}

/** A customer reviewed an order from this shop; carries the shop's new average rating. */
export interface ShopReviewEvent {
  type: "shop:review";
  shopId: string;
  orderId: string;
  reviewId: string;
  average: number | null;
  count: number;
}

/** A shop reported a customer, or an admin acted on a report (admin queue and dashboard). */
export interface ReportChangedEvent {
  type: "report:changed";
  reportId: string;
  shopId: string;
}

/** A Notification row was created for `userId` (bell count, list and toast). */
export interface NotificationEvent {
  type: "notification:new";
  userId: string;
  notification: {
    id: string;
    type: NotificationType;
    title: string;
    body: string;
    link: string | null;
    readAt: null;
    createdAt: string;
  };
}

export type RealtimeEvent = OrderStatusEvent | MenuItemEvent | ShopUpdatedEvent | ShopReviewEvent | ReportChangedEvent | NotificationEvent;
export type RealtimeEventName = RealtimeEvent["type"];
export type RealtimeEventOf<N extends RealtimeEventName> = Extract<RealtimeEvent, { type: N }>;

/** Statuses of an open or just-decided dispute: changes into or out of them also go to the admin room (SPEC §6). */
export const DISPUTE_STATUSES: readonly OrderStatus[] = ["REFUND_REQUESTED", "COMPLAINT_FILED"];

/** The rooms an event is delivered to. Exported for tests. */
export function roomsFor(event: RealtimeEvent): string[] {
  switch (event.type) {
    case "order:status": {
      const rooms = [`user:${event.customerId}`, `order:${event.orderId}`, `shop:${event.shopId}`];
      if (DISPUTE_STATUSES.includes(event.status) || DISPUTE_STATUSES.includes(event.fromStatus)) rooms.push("admin");
      return rooms;
    }
    case "menu:item":
    case "shop:updated":
    case "shop:review":
      return [`menu:${event.shopId}`, `shop:${event.shopId}`];
    case "report:changed":
      return ["admin"];
    case "notification:new":
      return [`user:${event.userId}`];
  }
}

/** Closes every open socket of a user (they were just suspended); reconnecting is refused at the handshake. */
export function disconnectUser(userId: string): void {
  getIO()?.in(`user:${userId}`).disconnectSockets(true);
}

export function emit(event: RealtimeEvent): void {
  const io = getIO();
  if (!io) return;
  io.to(roomsFor(event)).emit(event.type, event);
}

/** Pushes freshly created Notification rows to their users. */
export function emitNotifications(
  rows: readonly { id: string; userId: string; type: NotificationType; title: string; body: string; link: string | null; createdAt: Date }[],
): void {
  for (const { userId, createdAt, ...rest } of rows) {
    emit({ type: "notification:new", userId, notification: { ...rest, readAt: null, createdAt: createdAt.toISOString() } });
  }
}
