/** The payment environment is misconfigured (unknown PAYMENTS_PROVIDER, Stripe selected without a key). API → 503. */
export class PaymentConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaymentConfigError";
  }
}
