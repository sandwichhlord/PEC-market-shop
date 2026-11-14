import { ArrowLeft, Phone } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DisputeCard } from "@/components/disputes/DisputeCard";
import { ShopDisputeActions } from "@/components/disputes/ShopDisputeActions";
import { LiveRefresh } from "@/components/realtime/LiveRefresh";
import { KitchenActionButton } from "@/components/shop/KitchenActionButton";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatDateTime } from "@/lib/datetime";
import { formatPaise } from "@/lib/money";
import { ORDER_STATUS_LABEL, PAYMENT_STATUS_LABEL } from "@/lib/order-status";
import { requirePageShop } from "@/server/shops/current";
import { findShopOrder } from "@/server/shops/orders";

export const metadata: Metadata = { title: "Order · PEC Market shop" };

export default async function ShopOrderPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { shop } = await requirePageShop();
  const { orderId } = await params;
  const order = await findShopOrder(shop.id, orderId);
  if (!order) notFound();

  return (
    <>
      <LiveRefresh on={["order:status"]} orderId={order.id} />
      <Link
        href="/shop/orders"
        className="mb-3 inline-flex min-h-11 items-center gap-1 text-sm font-medium text-slate-600 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-orange-600"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        All orders
      </Link>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Order #{order.orderNumber}</h1>
          <p className="text-sm text-slate-600">
            Placed <time dateTime={order.createdAt.toISOString()}>{formatDateTime(order.createdAt)}</time>
          </p>
        </div>
        <StatusBadge status={order.status} className="text-sm" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <section aria-labelledby="items-heading" className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 id="items-heading" className="mb-3 font-semibold text-slate-900">
              Items
            </h2>
            <ul className="divide-y divide-slate-100">
              {order.items.map((item) => (
                <li key={item.id} className="flex items-start justify-between gap-3 py-2 text-sm">
                  <span className="min-w-0">
                    <span className="font-semibold tabular-nums">{item.quantity}×</span> {item.nameAtOrder}
                    {item.refunded && <span className="ml-2 text-xs font-medium text-purple-700">Refunded</span>}
                  </span>
                  <span className="shrink-0 tabular-nums text-slate-700">{formatPaise(item.pricePaiseAtOrder * item.quantity)}</span>
                </li>
              ))}
            </ul>
            <dl className="mt-3 space-y-1 border-t border-slate-200 pt-3 text-sm">
              <div className="flex justify-between font-semibold text-slate-900">
                <dt>Total</dt>
                <dd className="tabular-nums">{formatPaise(order.totalPaise)}</dd>
              </div>
              {order.refundedPaise > 0 && (
                <div className="flex justify-between text-purple-700">
                  <dt>Refunded</dt>
                  <dd className="tabular-nums">−{formatPaise(order.refundedPaise)}</dd>
                </div>
              )}
              <div className="flex justify-between text-slate-600">
                <dt>Payment</dt>
                <dd>{PAYMENT_STATUS_LABEL[order.paymentStatus]}</dd>
              </div>
            </dl>
            <KitchenActionButton
              shopId={shop.id}
              orderId={order.id}
              orderNumber={order.orderNumber}
              status={order.status}
              className="mt-4"
            />
          </section>

          {order.complaints.length > 0 && (
            <section aria-labelledby="disputes-heading" className="rounded-xl border border-rose-200 bg-white p-4">
              <h2 id="disputes-heading" className="mb-3 font-semibold text-slate-900">
                Disputes
              </h2>
              <ul className="space-y-3">
                {order.complaints.map((c) => (
                  <DisputeCard key={c.id} dispute={c} items={order.items} viewer="shop">
                    {c.status === "OPEN" && (
                      <ShopDisputeActions shopId={shop.id} complaintId={c.id} type={c.type} refundAmountPaise={c.refundAmountPaise} />
                    )}
                  </DisputeCard>
                ))}
              </ul>
            </section>
          )}
        </div>

        <div className="space-y-4">
          <section aria-labelledby="customer-heading" className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
            <h2 id="customer-heading" className="mb-2 font-semibold text-slate-900">
              Customer
            </h2>
            <p className="text-slate-800">{order.customer.name}</p>
            {order.customer.phone && (
              <a
                href={`tel:${order.customer.phone}`}
                className="mt-1 inline-flex min-h-11 items-center gap-1 text-orange-700 hover:underline focus-visible:outline-2 focus-visible:outline-orange-600"
              >
                <Phone aria-hidden="true" className="size-4" />
                {order.customer.phone}
              </a>
            )}
          </section>
          <section aria-labelledby="timeline-heading" className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 id="timeline-heading" className="mb-3 font-semibold text-slate-900">
              Timeline
            </h2>
            <ol className="space-y-3 border-l border-slate-200 pl-4 text-sm">
              {order.events.map((e) => (
                <li key={e.id} className="relative">
                  <span aria-hidden="true" className="absolute top-1.5 -left-[21px] size-2.5 rounded-full bg-slate-400" />
                  <p className="font-medium text-slate-900">{ORDER_STATUS_LABEL[e.toStatus]}</p>
                  <p className="text-xs text-slate-500">
                    <time dateTime={e.createdAt.toISOString()}>{formatDateTime(e.createdAt)}</time>
                    {e.actor && <> · {e.actor.name}</>}
                  </p>
                  {e.note && <p className="mt-0.5 text-slate-600">{e.note}</p>}
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    </>
  );
}
