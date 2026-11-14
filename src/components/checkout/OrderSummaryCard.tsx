import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatPaise } from "@/lib/money";
import type { CustomerOrderSummary } from "@/server/orders/history";

/** Order number, shop, items and total — shown on the payment and checkout result pages. */
export function OrderSummaryCard({ order }: { order: CustomerOrderSummary }) {
  return (
    <section aria-label="Order summary" className="rounded-xl border border-slate-200 bg-white">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
        <div className="min-w-0">
          <p className="font-semibold text-slate-900">Order #{order.orderNumber}</p>
          <p className="truncate text-sm text-slate-500">{order.shop.name}</p>
        </div>
        <StatusBadge status={order.status} />
      </header>
      <ul className="divide-y divide-slate-100 px-4">
        {order.items.map((item) => (
          <li key={item.id} className="flex justify-between gap-3 py-2 text-sm">
            <span className="min-w-0 text-slate-700">
              {item.quantity} × {item.nameAtOrder}
            </span>
            <span className="shrink-0 text-slate-900 tabular-nums">{formatPaise(item.pricePaiseAtOrder * item.quantity)}</span>
          </li>
        ))}
      </ul>
      <p className="flex justify-between border-t border-slate-200 px-4 py-3 font-semibold text-slate-900">
        <span>Total</span>
        <span className="tabular-nums">{formatPaise(order.totalPaise)}</span>
      </p>
    </section>
  );
}
