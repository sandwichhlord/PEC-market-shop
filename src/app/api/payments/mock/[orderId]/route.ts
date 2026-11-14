import { NextResponse } from "next/server";
import { mockPaymentSchema, orderIdSchema } from "@/lib/validation/checkout";
import { requireOrderAccess } from "@/server/auth/guards";
import { notFound, readJson, withErrors } from "@/server/http";
import { applyMockPayment } from "@/server/orders/payment";
import { resolveProviderName } from "@/server/payments";

/**
 * POST JSON { action: "pay" | "fail" } → { status, changed, redirectTo }. The buttons of /pay/mock/[orderId].
 * Exists only while the mock provider is active (404 under Stripe) and only for the order's own customer.
 */
export const POST = withErrors(async (req: Request, ctx: { params: Promise<{ orderId: string }> }) => {
  const { orderId } = orderIdSchema.parse(await ctx.params);
  const { access } = await requireOrderAccess(req, orderId);
  if (access !== "customer" || resolveProviderName() !== "mock") throw notFound("Order not found.");
  const { action } = mockPaymentSchema.parse(await readJson(req));
  const result = await applyMockPayment(orderId, action);
  const page = action === "pay" ? "success" : "cancel";
  return NextResponse.json({ ...result, redirectTo: `/checkout/${page}?orderId=${encodeURIComponent(orderId)}` });
});
