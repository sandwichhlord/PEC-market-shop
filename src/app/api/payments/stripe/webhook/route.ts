import { NextResponse } from "next/server";
import { notFound, withErrors } from "@/server/http";
import { handleStripeWebhook } from "@/server/payments/webhook";
import { resolveProviderName } from "@/server/payments";

// No session guard: Stripe calls this endpoint, and every request is authenticated by verifying the
// Stripe-Signature header against STRIPE_WEBHOOK_SECRET (bad or missing signature → 400) before anything is read.
export const dynamic = "force-dynamic";

/** POST (raw Stripe event body) → { received: true, outcome }. 404 unless the Stripe provider is active. */
export const POST = withErrors(async (req: Request) => {
  if (resolveProviderName() !== "stripe") throw notFound();
  const rawBody = await req.text();
  const outcome = await handleStripeWebhook(rawBody, req.headers.get("stripe-signature"));
  return NextResponse.json({ received: true, outcome });
});
