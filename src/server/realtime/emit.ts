// Server → browser push. Business logic calls `emit()` after its database writes commit; this module decides which
// Socket.IO rooms hear about it. Rooms: user:<id>, shop:<id>, order:<id>, admin, and the public menu:<shopId>.
// Without a running Socket.IO server (unit tests, scripts) emitting is a no-op.
import type { OrderStatus, PaymentStatus } from "@/generated/prisma/enums";
import { getIO } from "./io";

export type RealtimeEvent =
  | {
      type: "order:status";
      orderId: string;
      orderNumber: string;
      shopId: string;
      customerId: string;
      fromStatus: OrderStatus;
      status: OrderStatus;
      paymentStatus: PaymentStatus;
    }
  | { type: "menu:item"; shopId: string; itemId: string; inStock: boolean; archived: boolean }
  | { type: "shop:updated"; shopId: string; isOpen: boolean };

/** The rooms an event is delivered to. Exported for tests. */
export function roomsFor(event: RealtimeEvent): string[] {
  switch (event.type) {
    case "order:status":
      return [`user:${event.customerId}`, `order:${event.orderId}`, `shop:${event.shopId}`];
    case "menu:item":
    case "shop:updated":
      return [`menu:${event.shopId}`, `shop:${event.shopId}`];
  }
}

export function emit(event: RealtimeEvent): void {
  const io = getIO();
  if (!io) return;
  io.to(roomsFor(event)).emit(event.type, event);
}
