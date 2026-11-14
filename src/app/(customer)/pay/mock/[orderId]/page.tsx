import { FlaskConical } from "lucide-react";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { MockPaymentButtons } from "@/components/checkout/MockPaymentButtons";
import { OrderSummaryCard } from "@/components/checkout/OrderSummaryCard";
import { PageHeader } from "@/components/ui/PageHeader";
import { orderIdSchema } from "@/lib/validation/checkout";
import { requirePageUser } from "@/server/auth/current";
import { getCustomerOrderSummary } from "@/server/orders/history";
import { PaymentConfigError, resolveProviderName } from "@/server/payments";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Test payment · PEC Market" };

const mockActive = () => {
  try {
    return resolveProviderName() === "mock";
  } catch (err) {
    if (err instanceof PaymentConfigError) return false;
    throw err;
  }
};

/** The MockProvider's hosted checkout (SPEC §7): "Pay" or "Fail" this order. Only exists while payments are mocked. */
export default async function MockPaymentPage({ params }: { params: Promise<{ orderId: string }> }) {
  const user = await requirePageUser("CUSTOMER");
  const parsed = orderIdSchema.safeParse(await params);
  if (!parsed.success || !mockActive()) notFound();
  const order = await getCustomerOrderSummary(parsed.data.orderId, user.id);
  if (!order) notFound();
  const back = `?orderId=${encodeURIComponent(order.id)}`;
  if (order.status === "PAYMENT_FAILED") redirect(`/checkout/cancel${back}`);
  if (order.status !== "PENDING_PAYMENT") redirect(`/checkout/success${back}`);

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <PageHeader title="Test payment" description="Payments are in test mode — no real money moves." />
      <p className="flex items-start gap-2 rounded-lg border border-dashed border-slate-300 bg-white p-3 text-sm text-slate-600">
        <FlaskConical aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-slate-400" />
        This page stands in for the card checkout. Choose whether the payment succeeds or fails.
      </p>
      <OrderSummaryCard order={order} />
      <MockPaymentButtons orderId={order.id} totalPaise={order.totalPaise} />
    </div>
  );
}
