import type { OrderStatus, PaymentStatus } from "@/generated/prisma/enums";

/** Human-readable order status names (badge colours live in components/ui/StatusBadge.tsx). */
export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING_PAYMENT: "Awaiting payment",
  PAYMENT_FAILED: "Payment failed",
  PLACED_PAID: "Placed & paid",
  PREPARING: "Preparing",
  READY_FOR_PICKUP: "Ready for pickup",
  COMPLETED: "Completed",
  REFUND_REQUESTED: "Refund requested",
  REFUNDED: "Refunded",
  COMPLAINT_FILED: "Complaint filed",
  RESOLVED: "Resolved",
};

/** What the customer is told when their order reaches a status someone else moved it to (notifications). */
export const CUSTOMER_STATUS_MESSAGE: Partial<Record<OrderStatus, string>> = {
  PLACED_PAID: "Payment received — your order has been sent to the shop.",
  PREPARING: "The shop has started preparing your order.",
  READY_FOR_PICKUP: "Your order is ready for pickup!",
  COMPLETED: "Order completed. Enjoy your food!",
  REFUNDED: "Your refund has been issued.",
  RESOLVED: "Your complaint has been resolved.",
  PAYMENT_FAILED: "Payment failed. Your cart is saved — you can try again.",
};

/** Kitchen statuses a shop works through, and the queue filters on the shop's orders dashboard. */
export const KITCHEN_STATUSES = ["PLACED_PAID", "PREPARING", "READY_FOR_PICKUP"] as const satisfies readonly OrderStatus[];
export const SHOP_ORDER_FILTERS = {
  active: KITCHEN_STATUSES,
  completed: ["COMPLETED", "REFUNDED", "RESOLVED"],
  disputes: ["REFUND_REQUESTED", "COMPLAINT_FILED"],
} as const satisfies Record<string, readonly OrderStatus[]>;
export type ShopOrderFilter = keyof typeof SHOP_ORDER_FILTERS;
/** Orders a shop ever sees: paid ones. Unpaid checkouts never reach the shop (SPEC §3). */
export const SHOP_VISIBLE_STATUSES: readonly OrderStatus[] = Object.values(SHOP_ORDER_FILTERS).flat();

/** The one-tap kitchen actions on the shop dashboard (SPEC §4), keyed by the status they move the order to. */
export const KITCHEN_ACTION_LABEL = {
  PREPARING: "Payment received – start preparing",
  READY_FOR_PICKUP: "Ready for pickup",
  COMPLETED: "Mark completed",
} as const satisfies Partial<Record<OrderStatus, string>>;
export type KitchenTarget = keyof typeof KITCHEN_ACTION_LABEL;
export const KITCHEN_TARGETS = Object.keys(KITCHEN_ACTION_LABEL) as KitchenTarget[];

/** The next kitchen action for an order in `status`, if any. */
export function nextKitchenTarget(status: OrderStatus): KitchenTarget | null {
  if (status === "PLACED_PAID") return "PREPARING";
  if (status === "PREPARING") return "READY_FOR_PICKUP";
  if (status === "READY_FOR_PICKUP") return "COMPLETED";
  return null;
}

/** Statuses an order is still "in progress" in (the customer's Active tab). */
export const ACTIVE_ORDER_STATUSES = [
  "PLACED_PAID",
  "PREPARING",
  "READY_FOR_PICKUP",
  "REFUND_REQUESTED",
  "COMPLAINT_FILED",
] as const satisfies readonly OrderStatus[];

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  PENDING: "Payment pending",
  PAID: "Paid online",
  REFUND_REQUESTED: "Refund requested",
  REFUNDED: "Refunded",
  PARTIALLY_REFUNDED: "Partially refunded",
  FAILED: "Payment failed",
};
