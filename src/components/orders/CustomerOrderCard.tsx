import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Thumb } from "@/components/ui/Thumb";
import { formatDateTime } from "@/lib/datetime";
import { formatPaise } from "@/lib/money";
import type { CustomerOrderListItem } from "@/server/orders/history";

/** One row of the customer's order history; the whole card links to the order page. */
export function CustomerOrderCard({ order }: { order: CustomerOrderListItem }) {
  const summary = order.items.map((i) => `${i.quantity}× ${i.nameAtOrder}`).join(", ");
  return (
    <Link
      href={`/orders/${order.id}`}
      data-testid="order-card"
      className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 hover:border-slate-300 focus-visible:outline-2 focus-visible:outline-orange-600"
    >
      <Thumb src={order.shop.logoUrl} alt="" size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="truncate font-semibold text-slate-900">{order.shop.name}</p>
          <p className="shrink-0 font-semibold text-slate-900 tabular-nums">{formatPaise(order.totalPaise)}</p>
        </div>
        <p className="truncate text-sm text-slate-600">{summary}</p>
        <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-slate-500">
            #{order.orderNumber} · <time dateTime={order.createdAt.toISOString()}>{formatDateTime(order.createdAt)}</time>
          </p>
          <StatusBadge status={order.status} />
        </div>
      </div>
      <ChevronRight aria-hidden="true" className="size-5 shrink-0 text-slate-400" />
    </Link>
  );
}
