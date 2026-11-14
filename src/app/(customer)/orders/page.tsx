import { ClipboardList } from "lucide-react";
import type { Metadata } from "next";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { formatDateTime } from "@/lib/datetime";
import { formatPaise } from "@/lib/money";
import { ORDER_STATUS_LABEL } from "@/lib/order-status";
import { requirePageUser } from "@/server/auth/current";
import { listCustomerOrders } from "@/server/orders/history";

export const metadata: Metadata = { title: "Orders · PEC Market" };

export default async function OrdersPage() {
  const user = await requirePageUser("CUSTOMER");
  const orders = await listCustomerOrders(user.id);
  return (
    <>
      <PageHeader title="Your orders" />
      {orders.length === 0 ? (
        <EmptyState icon={ClipboardList} title="No orders yet">
          Your orders will show up here once you place one.
        </EmptyState>
      ) : (
        <ul className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white">
          {orders.map((order) => (
            <li key={order.id} className="flex items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="truncate font-semibold text-slate-900">{order.shop.name}</p>
                <p className="text-sm text-slate-500">
                  #{order.orderNumber} · {order._count.items} item{order._count.items === 1 ? "" : "s"} ·{" "}
                  {formatDateTime(order.createdAt)}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="font-semibold text-slate-900">{formatPaise(order.totalPaise)}</p>
                <p className="text-xs text-slate-600">{ORDER_STATUS_LABEL[order.status]}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
