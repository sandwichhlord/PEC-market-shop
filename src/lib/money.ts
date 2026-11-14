/** Formats integer paise for display, e.g. 12050 → "₹120.50". Money is stored as paise everywhere else. */
export function formatPaise(amountPaise: number, currency: string = process.env.CURRENCY ?? "inr"): string {
  if (!Number.isInteger(amountPaise)) throw new TypeError(`amountPaise must be an integer, got ${amountPaise}`);
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: amountPaise % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amountPaise / 100);
}
