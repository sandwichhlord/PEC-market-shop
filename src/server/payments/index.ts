// Provider selection by env (CLAUDE.md): PAYMENTS_PROVIDER = stripe | mock | auto (stripe if STRIPE_SECRET_KEY is
// set, else mock). Read on every call so tests and E2E runs can switch providers through the environment.
import { PaymentConfigError } from "./errors";
import { MockProvider } from "./mock";
import { StripeProvider, createStripeProvider } from "./stripe";
import type { PaymentProvider, PaymentProviderName } from "./types";

export { PaymentConfigError };

type PaymentEnv = Record<string, string | undefined>;

/** Which provider the environment selects. Throws PaymentConfigError for an unknown value or a missing Stripe key. */
export function resolveProviderName(env: PaymentEnv = process.env): PaymentProviderName {
  const setting = (env.PAYMENTS_PROVIDER ?? "auto").trim().toLowerCase() || "auto";
  const hasKey = Boolean(env.STRIPE_SECRET_KEY?.trim());
  if (setting === "mock") return "mock";
  if (setting === "stripe") {
    if (!hasKey) throw new PaymentConfigError("PAYMENTS_PROVIDER=stripe needs STRIPE_SECRET_KEY.");
    return "stripe";
  }
  if (setting === "auto") return hasKey ? "stripe" : "mock";
  throw new PaymentConfigError(`Unknown PAYMENTS_PROVIDER "${env.PAYMENTS_PROVIDER}" (use stripe, mock or auto).`);
}

export const appUrl = () => process.env.APP_URL ?? `http://localhost:${process.env.PORT ?? 3000}`;
export const currency = () => (process.env.CURRENCY ?? "inr").trim().toLowerCase();

let cachedStripe: { key: string; secret: string | undefined; appUrl: string; provider: StripeProvider } | undefined;

/** The configured provider. */
export function getPaymentProvider(): PaymentProvider {
  return resolveProviderName() === "stripe" ? getStripeProvider() : new MockProvider(appUrl());
}

/** The Stripe provider (webhooks need its Stripe-only `parseWebhook`). Throws if Stripe is not the configured provider. */
export function getStripeProvider(): StripeProvider {
  if (resolveProviderName() !== "stripe") throw new PaymentConfigError("Stripe payments are not enabled.");
  const key = process.env.STRIPE_SECRET_KEY!.trim();
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim() || undefined;
  const url = appUrl();
  if (!cachedStripe || cachedStripe.key !== key || cachedStripe.secret !== secret || cachedStripe.appUrl !== url) {
    cachedStripe = { key, secret, appUrl: url, provider: createStripeProvider(key, { appUrl: url, webhookSecret: secret }) };
  }
  return cachedStripe.provider;
}

export type { PaymentProvider, PaymentProviderName } from "./types";
