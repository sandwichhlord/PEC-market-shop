import type { OrderStatus } from "@/generated/prisma/enums";
import { ORDER_STATUS_LABEL } from "@/lib/order-status";

/** Badge colours per order status (SPEC §8). The single place these colours are defined. */
export const STATUS_BADGE_STYLE: Record<OrderStatus, { badge: string; dot: string; pulse?: boolean }> = {
  PENDING_PAYMENT: { badge: "bg-gray-100 text-gray-700 ring-gray-300", dot: "bg-gray-500" },
  PLACED_PAID: { badge: "bg-blue-50 text-blue-700 ring-blue-200", dot: "bg-blue-500" },
  PREPARING: { badge: "bg-amber-50 text-amber-800 ring-amber-200", dot: "bg-amber-500" },
  READY_FOR_PICKUP: { badge: "bg-green-50 text-green-700 ring-green-200", dot: "bg-green-500", pulse: true },
  COMPLETED: { badge: "bg-slate-100 text-slate-700 ring-slate-300", dot: "bg-slate-500" },
  PAYMENT_FAILED: { badge: "bg-red-50 text-red-700 ring-red-200", dot: "bg-red-500" },
  REFUND_REQUESTED: { badge: "bg-orange-50 text-orange-700 ring-orange-200", dot: "bg-orange-500" },
  REFUNDED: { badge: "bg-purple-50 text-purple-700 ring-purple-200", dot: "bg-purple-500" },
  COMPLAINT_FILED: { badge: "bg-rose-50 text-rose-700 ring-rose-200", dot: "bg-rose-500" },
  RESOLVED: { badge: "bg-teal-50 text-teal-700 ring-teal-200", dot: "bg-teal-500" },
};

/** Colour-coded order status pill. READY_FOR_PICKUP gets a pulsing dot. */
export function StatusBadge({ status, className = "" }: { status: OrderStatus; className?: string }) {
  const style = STATUS_BADGE_STYLE[status];
  return (
    <span
      data-status={status}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset ${style.badge} ${className}`}
    >
      <span aria-hidden="true" className="relative flex size-2">
        {style.pulse && (
          <span className={`absolute inline-flex size-full animate-ping rounded-full opacity-75 motion-reduce:hidden ${style.dot}`} />
        )}
        <span className={`relative inline-flex size-2 rounded-full ${style.dot}`} />
      </span>
      {ORDER_STATUS_LABEL[status]}
    </span>
  );
}
