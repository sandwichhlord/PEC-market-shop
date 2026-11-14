import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatDateTime } from "@/lib/datetime";
import { formatPaise } from "@/lib/money";
import { PAYMENT_STATUS_LABEL } from "@/lib/order-status";
import type { ShopOrderSummary } from "@/server/shops/orders";
import { KitchenActionButton } from "./KitchenActionButton";

/** One order on the shop dashboard: number, items × qty, customer, total, payment status, time, status + next action. */
export function ShopOrderCard({ order, shopId }: { order: ShopOrderSummary; shopId: string }) {
  return (
    <article
      aria-label={`Order ${order.orderNumber}`}
      data-status={order.status}
      className={`rounded-xl border bg-white p-4 ${order.status === "PLACED_PAID" ? "border-blue-300 ring-2 ring-blue-100" : "border-slate-200"}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="font-semibold text-slate-900">
            <Link href={`/shop/orders/${order.id}`} className="inline-flex items-center gap-1 hover:underline focus-visible:outline-2 focus-visible:outline-orange-600">
              #{order.orderNumber}
              <ChevronRight aria-hidden="true" className="size-4 text-slate-400" />
            </Link>
          </h2>
          <p className="text-sm text-slate-600">
            {order.customer.name} · <time dateTime={order.createdAt.toISOString()}>{formatDateTime(order.createdAt)}</time>
          </p>
        </div>
        <StatusBadge status={order.status} />
      </div>
      <ul className="mt-3 space-y-0.5 text-sm text-slate-800">
        {order.items.map((item) => (
          <li key={item.id} className="flex gap-2">
            <span className="w-8 shrink-0 font-semibold tabular-nums">{item.quantity}×</span>
            <span className="min-w-0 break-words">{item.nameAtOrder}</span>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
        <p className="text-sm">
          <span className="font-semibold text-slate-900">{formatPaise(order.totalPaise)}</span>
          <span className="text-slate-500"> · {PAYMENT_STATUS_LABEL[order.paymentStatus]}</span>
        </p>
        <KitchenActionButton shopId={shopId} orderId={order.id} orderNumber={order.orderNumber} status={order.status} />
      </div>
    </article>
  );
}
