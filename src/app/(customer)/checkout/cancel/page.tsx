import { CheckCircle2, XCircle } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckoutResult } from "@/components/checkout/CheckoutResult";
import { ClearCartOnMount } from "@/components/checkout/ClearCartOnMount";
import { OrderSummaryCard } from "@/components/checkout/OrderSummaryCard";
import { buttonClasses } from "@/components/ui/Button";
import { orderIdSchema } from "@/lib/validation/checkout";
import { requirePageUser } from "@/server/auth/current";
import { getCustomerOrderSummary } from "@/server/orders/history";
import { UNPAID_STATUSES, cancelCheckout } from "@/server/orders/payment";
import { getPaymentProvider } from "@/server/payments";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Payment cancelled · PEC Market" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/**
 * Where the hosted checkout returns when the customer cancels, and where a failed payment lands. A still-pending
 * order becomes PAYMENT_FAILED (its checkout session is closed); the cart is kept so they can retry.
 */
export default async function CheckoutCancelPage({ searchParams }: Props) {
  const user = await requirePageUser("CUSTOMER");
  const parsed = orderIdSchema.safeParse(await searchParams);
  if (!parsed.success) notFound();
  const orderId = parsed.data.orderId;
  let order = await getCustomerOrderSummary(orderId, user.id);
  if (!order) notFound();

  if (order.status === "PENDING_PAYMENT") {
    try {
      await cancelCheckout(order.id, getPaymentProvider());
      order = (await getCustomerOrderSummary(orderId, user.id)) ?? order;
    } catch (err) {
      console.error("[checkout] could not cancel the checkout", err);
    }
  }
  const paid = !(UNPAID_STATUSES as readonly string[]).includes(order.status);

  return (
    <div className="mx-auto max-w-lg space-y-5">
      {paid ? (
        <>
          <ClearCartOnMount shopId={order.shopId} />
          <CheckoutResult icon={CheckCircle2} tone="success" title="This order is already paid">
            Order #{order.orderNumber} went through and has been sent to {order.shop.name}.
          </CheckoutResult>
        </>
      ) : (
        <CheckoutResult icon={XCircle} tone="failure" title="Payment cancelled">
          No money was taken. Your cart is saved — you can try again whenever you&apos;re ready.
        </CheckoutResult>
      )}
      <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
        {paid ? (
          <Link href="/orders" className={buttonClasses("primary")}>
            View your orders
          </Link>
        ) : (
          <Link href="/cart" className={buttonClasses("primary")}>
            Back to cart
          </Link>
        )}
        <Link href="/shops" className={buttonClasses("secondary")}>
          Back to shops
        </Link>
      </div>
      <OrderSummaryCard order={order} />
    </div>
  );
}
