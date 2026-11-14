import { ArrowLeft, MapPin } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CustomerDisputeActions } from "@/components/disputes/CustomerDisputeActions";
import { DisputeCard } from "@/components/disputes/DisputeCard";
import { OrderTimeline } from "@/components/orders/OrderTimeline";
import { OrderTracker } from "@/components/orders/OrderTracker";
import { LiveRefresh } from "@/components/realtime/LiveRefresh";
import { ReviewCard } from "@/components/reviews/ReviewCard";
import { ReviewForm } from "@/components/reviews/ReviewForm";
import { Alert } from "@/components/ui/Alert";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Thumb } from "@/components/ui/Thumb";
import { formatDateTime } from "@/lib/datetime";
import { formatPaise } from "@/lib/money";
import { COMPLAINABLE_STATUSES, RESUMABLE_STATUSES } from "@/lib/order-state";
import { PAYMENT_STATUS_LABEL } from "@/lib/order-status";
import { orderIdSchema } from "@/lib/validation/checkout";
import { requirePageUser } from "@/server/auth/current";
import { getCustomerOrderDetail, type CustomerOrderDetail } from "@/server/orders/history";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Order · PEC Market" };

const link = "font-medium underline underline-offset-2";

/** A short explanation for statuses outside the normal kitchen flow. */
function StatusNotice({ order }: { order: CustomerOrderDetail }) {
  switch (order.status) {
    case "PENDING_PAYMENT":
      return (
        <Alert tone="info">
          We are waiting for your payment to be confirmed.{" "}
          <Link href={`/checkout/success?orderId=${order.id}`} className={link}>
            Check payment status
          </Link>
        </Alert>
      );
    case "PAYMENT_FAILED":
      return (
        <Alert tone="error">
          Payment failed, so this order was not sent to the shop and you were not charged. Your cart was kept —{" "}
          <Link href="/cart" className={link}>
            try again from your cart
          </Link>
          .
        </Alert>
      );
    case "REFUND_REQUESTED":
      return <Alert tone="warning">Your refund request is with the shop. We will notify you when they respond.</Alert>;
    case "COMPLAINT_FILED":
      return <Alert tone="warning">Your complaint is with the shop. We will notify you when it is answered.</Alert>;
    case "REFUNDED":
      return <Alert tone="success">This order was refunded ({formatPaise(order.refundedPaise)}) to your original payment method.</Alert>;
    case "RESOLVED":
      return <Alert tone="success">Your complaint about this order was resolved.</Alert>;
    default:
      return null;
  }
}

export default async function CustomerOrderPage({ params }: { params: Promise<{ orderId: string }> }) {
  const user = await requirePageUser("CUSTOMER");
  const parsed = orderIdSchema.safeParse(await params);
  if (!parsed.success) notFound();
  const order = await getCustomerOrderDetail(parsed.data.orderId, user.id);
  if (!order) notFound();
  const paid = order.status !== "PENDING_PAYMENT" && order.status !== "PAYMENT_FAILED";
  const canRequestRefund = (RESUMABLE_STATUSES as readonly string[]).includes(order.status);
  const canComplain = (COMPLAINABLE_STATUSES as readonly string[]).includes(order.status);

  return (
    <>
      <LiveRefresh on={["order:status"]} orderId={order.id} subscribe={{ kind: "order", id: order.id }} />
      <Link
        href="/orders"
        className="mb-3 inline-flex min-h-11 items-center gap-1 text-sm font-medium text-slate-600 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-orange-600"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        All orders
      </Link>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Thumb src={order.shop.logoUrl} alt="" size="md" />
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Order #{order.orderNumber}</h1>
            <p className="truncate text-sm text-slate-600">
              <Link href={`/shops/${order.shop.id}`} className="font-medium text-slate-800 hover:underline">
                {order.shop.name}
              </Link>{" "}
              · <time dateTime={order.createdAt.toISOString()}>{formatDateTime(order.createdAt)}</time>
            </p>
          </div>
        </div>
        <StatusBadge status={order.status} className="text-sm" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <StatusNotice order={order} />
          {paid && <OrderTracker steps={order.steps} estimate={order.estimate} now={new Date()} />}

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
                  <span className="shrink-0 text-slate-700 tabular-nums">{formatPaise(item.pricePaiseAtOrder * item.quantity)}</span>
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
            <div className="mt-4">
              <CustomerDisputeActions
                orderId={order.id}
                refundableItems={order.items.filter((i) => !i.refunded)}
                canRequestRefund={canRequestRefund}
                canComplain={canComplain}
              />
            </div>
          </section>

          {(order.review || order.status === "COMPLETED") && (
            <section aria-labelledby="review-heading" className="rounded-xl border border-slate-200 bg-white p-4">
              <h2 id="review-heading" className="mb-3 font-semibold text-slate-900">
                {order.review ? "Your review" : `How was ${order.shop.name}?`}
              </h2>
              {order.review ? <ReviewCard review={order.review} /> : <ReviewForm orderId={order.id} />}
            </section>
          )}

          {order.complaints.length > 0 && (
            <section aria-labelledby="disputes-heading" className="rounded-xl border border-slate-200 bg-white p-4">
              <h2 id="disputes-heading" className="mb-3 font-semibold text-slate-900">
                Refunds &amp; complaints
              </h2>
              <ul className="space-y-3">
                {order.complaints.map((c) => (
                  <DisputeCard key={c.id} dispute={c} items={order.items} viewer="customer" />
                ))}
              </ul>
            </section>
          )}
        </div>

        <div className="space-y-4">
          {order.shop.location && (
            <section aria-labelledby="pickup-heading" className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
              <h2 id="pickup-heading" className="mb-2 font-semibold text-slate-900">
                Pickup
              </h2>
              <p className="flex items-start gap-1.5 text-slate-700">
                <MapPin aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-slate-500" />
                {order.shop.name}, {order.shop.location}
              </p>
            </section>
          )}
          <OrderTimeline events={order.events} shopName={order.shop.name} />
        </div>
      </div>
    </>
  );
}
