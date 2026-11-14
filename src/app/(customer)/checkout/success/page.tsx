import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckoutResult } from "@/components/checkout/CheckoutResult";
import { ClearCartOnMount } from "@/components/checkout/ClearCartOnMount";
import { OrderSummaryCard } from "@/components/checkout/OrderSummaryCard";
import { RefreshWhilePending } from "@/components/checkout/RefreshWhilePending";
import { buttonClasses } from "@/components/ui/Button";
import { orderIdSchema } from "@/lib/validation/checkout";
import { requirePageUser } from "@/server/auth/current";
import { getCustomerOrderSummary } from "@/server/orders/history";
import { UNPAID_STATUSES, confirmCheckoutPayment } from "@/server/orders/payment";
import { getPaymentProvider } from "@/server/payments";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Payment · PEC Market" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/**
 * Where the hosted checkout returns after paying. Confirms the payment with the provider (SPEC §7: so it works
 * without webhooks), then shows the result. Idempotent with the webhook — whichever arrives first wins.
 */
export default async function CheckoutSuccessPage({ searchParams }: Props) {
  const user = await requirePageUser("CUSTOMER");
  const parsed = orderIdSchema.safeParse(await searchParams);
  if (!parsed.success) notFound();
  const orderId = parsed.data.orderId;
  let order = await getCustomerOrderSummary(orderId, user.id);
  if (!order) notFound();

  if ((UNPAID_STATUSES as readonly string[]).includes(order.status)) {
    try {
      await confirmCheckoutPayment(order.id, getPaymentProvider());
      order = (await getCustomerOrderSummary(orderId, user.id)) ?? order;
    } catch (err) {
      // The webhook may still confirm it; the page keeps polling while the order is pending.
      console.error("[checkout] could not verify payment on the success page", err);
    }
  }

  const links = (
    <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
      <Link href={`/orders/${order.id}`} className={buttonClasses("primary")}>
        Track your order
      </Link>
      <Link href="/shops" className={buttonClasses("secondary")}>
        Back to shops
      </Link>
    </div>
  );

  return (
    <div className="mx-auto max-w-lg space-y-5">
      {order.status === "PENDING_PAYMENT" ? (
        <>
          <RefreshWhilePending />
          <CheckoutResult icon={Loader2} tone="pending" title="Confirming your payment…">
            This usually takes a few seconds. You can stay on this page.
          </CheckoutResult>
        </>
      ) : order.status === "PAYMENT_FAILED" ? (
        <CheckoutResult icon={XCircle} tone="failure" title="Payment didn't go through">
          Your cart is saved, so you can try again.
          <div className="mt-4">
            <Link href="/cart" className={buttonClasses("primary")}>
              Back to cart
            </Link>
          </div>
        </CheckoutResult>
      ) : (
        <>
          <ClearCartOnMount shopId={order.shopId} />
          <CheckoutResult icon={CheckCircle2} tone="success" title="Payment received">
            Order #{order.orderNumber} has been sent to {order.shop.name}. We&apos;ll let you know as it progresses.
          </CheckoutResult>
        </>
      )}
      <OrderSummaryCard order={order} />
      {order.status !== "PAYMENT_FAILED" && links}
    </div>
  );
}
