import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AccountStatusPill } from "@/components/admin/AccountStatusPill";
import { AdminDisputeActions } from "@/components/admin/AdminDisputeActions";
import { DisputeStatusPill } from "@/components/admin/DisputeStatusPill";
import { LiveRefresh } from "@/components/realtime/LiveRefresh";
import { Alert } from "@/components/ui/Alert";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatDateTime } from "@/lib/datetime";
import { formatPaise } from "@/lib/money";
import { COMPLAINT_TYPE_LABEL, ORDER_STATUS_LABEL, PAYMENT_STATUS_LABEL } from "@/lib/order-status";
import { adminIdSchema } from "@/lib/validation/admin";
import { getAdminDispute } from "@/server/admin/disputes";

export const metadata: Metadata = { title: "Dispute · PEC Market admin" };
export const dynamic = "force-dynamic";

const ACTOR_LABEL = { CUSTOMER: "Customer", SHOP_OWNER: "Shop", ADMIN: "Admin" } as const;

export default async function AdminDisputePage({ params }: { params: Promise<{ id: string }> }) {
  const parsed = adminIdSchema.safeParse(await params);
  if (!parsed.success) notFound();
  const d = await getAdminDispute(parsed.data.id);
  if (!d) notFound();
  const order = d.order;
  const active = d.status === "OPEN" || d.status === "ESCALATED";
  const otherOpenDispute = d.status === "ESCALATED" && (order.status === "REFUND_REQUESTED" || order.status === "COMPLAINT_FILED");
  const requested = order.items.filter((i) => d.itemIds.includes(i.id));

  return (
    <>
      <LiveRefresh on={["order:status"]} orderId={order.id} subscribe={{ kind: "order", id: order.id }} />
      <Link
        href="/admin/disputes"
        className="mb-3 inline-flex min-h-11 items-center gap-1 text-sm font-medium text-slate-600 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-orange-600"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        All disputes
      </Link>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {COMPLAINT_TYPE_LABEL[d.type]} · #{order.orderNumber}
          </h1>
          <p className="text-sm text-slate-600">
            {order.shop.name} · filed <time dateTime={d.createdAt.toISOString()}>{formatDateTime(d.createdAt)}</time>
          </p>
        </div>
        <span data-testid="dispute-status" data-dispute-status={d.status}>
          <DisputeStatusPill status={d.status} />
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <section aria-labelledby="claim-heading" className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
            <h2 id="claim-heading" className="mb-2 font-semibold text-slate-900">
              What the customer said
            </h2>
            {requested.length > 0 && (
              <p className="mb-1 text-slate-700">
                Items: {requested.map((i) => `${i.quantity}× ${i.nameAtOrder}`).join(", ")}
                {d.refundAmountPaise !== null && <> · {formatPaise(d.refundAmountPaise)}</>}
              </p>
            )}
            <p className="whitespace-pre-line text-slate-800">{d.description}</p>
            {d.shopResponse && (
              <p className="mt-3 whitespace-pre-line text-slate-700">
                <span className="font-medium">Shop’s response:</span> {d.shopResponse}
              </p>
            )}
            {d.resolution && (
              <p className="mt-2 whitespace-pre-line text-slate-700">
                <span className="font-medium">Resolution:</span> {d.resolution}
              </p>
            )}
            {active && (
              <div className="mt-4 border-t border-slate-100 pt-4">
                {otherOpenDispute ? (
                  <Alert tone="warning">
                    The customer has another open {order.status === "REFUND_REQUESTED" ? "refund request" : "complaint"} on this order.
                    Handle that one first.
                  </Alert>
                ) : (
                  <AdminDisputeActions
                    disputeId={d.id}
                    type={d.type}
                    refundableItems={order.items.filter((i) => !i.refunded)}
                    requestedItemIds={d.itemIds}
                  />
                )}
              </div>
            )}
          </section>

          <section aria-labelledby="order-heading" className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 id="order-heading" className="font-semibold text-slate-900">
                Order
              </h2>
              <StatusBadge status={order.status} />
            </div>
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
                <dt>Total paid</dt>
                <dd className="tabular-nums">{formatPaise(order.totalPaise)}</dd>
              </div>
              <div className="flex justify-between text-purple-700">
                <dt>Refunded so far</dt>
                <dd className="tabular-nums" data-testid="refunded-so-far">
                  {formatPaise(order.refundedPaise)}
                </dd>
              </div>
              <div className="flex justify-between text-slate-600">
                <dt>Payment</dt>
                <dd>{PAYMENT_STATUS_LABEL[order.paymentStatus]}</dd>
              </div>
            </dl>
          </section>
        </div>

        <div className="space-y-4">
          <section aria-labelledby="customer-heading" className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
            <h2 id="customer-heading" className="mb-2 font-semibold text-slate-900">
              Customer
            </h2>
            <p className="flex flex-wrap items-center gap-2 text-slate-800">
              {order.customer.name} <AccountStatusPill status={order.customer.status} />
            </p>
            <p className="break-all text-slate-500">{order.customer.email}</p>
            <Link
              href={`/admin/users?q=${encodeURIComponent(order.customer.email)}`}
              className="mt-2 inline-flex min-h-11 items-center font-medium text-orange-700 hover:underline focus-visible:outline-2 focus-visible:outline-orange-600"
            >
              Manage account
            </Link>
          </section>
          <section aria-labelledby="timeline-heading" className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 id="timeline-heading" className="mb-3 font-semibold text-slate-900">
              Status history
            </h2>
            <ol className="space-y-3 border-l border-slate-200 pl-4 text-sm">
              {order.events.map((e) => (
                <li key={e.id} className="relative">
                  <span aria-hidden="true" className="absolute top-1.5 -left-[21px] size-2.5 rounded-full bg-slate-400" />
                  <p className="font-medium text-slate-900">{e.fromStatus === null ? "Order created" : ORDER_STATUS_LABEL[e.toStatus]}</p>
                  <p className="text-xs text-slate-500">
                    <time dateTime={e.createdAt.toISOString()}>{formatDateTime(e.createdAt)}</time>
                    {e.actor && <> · {ACTOR_LABEL[e.actor.role]}</>}
                  </p>
                  {e.note && <p className="mt-0.5 whitespace-pre-line text-slate-600">{e.note}</p>}
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    </>
  );
}
