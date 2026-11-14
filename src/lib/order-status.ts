import type { OrderStatus } from "@/generated/prisma/enums";

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

/** Statuses an order is still "in progress" in (the Active tab / the shop's active queue). */
export const ACTIVE_ORDER_STATUSES = [
  "PLACED_PAID",
  "PREPARING",
  "READY_FOR_PICKUP",
  "REFUND_REQUESTED",
  "COMPLAINT_FILED",
] as const satisfies readonly OrderStatus[];
