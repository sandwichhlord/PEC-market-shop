import { z } from "zod";
import { MAX_LINE_QUANTITY } from "@/lib/cart/cart";

const id = z.string().trim().min(1).max(64);

/**
 * `POST /api/checkout`: the cart as the customer saw it. Prices are sent so the server can refuse a checkout whose
 * prices changed (or were tampered with) instead of silently charging a different amount.
 */
export const checkoutSchema = z.object({
  shopId: id,
  items: z
    .array(
      z.object({
        menuItemId: id,
        quantity: z.number().int().min(1).max(MAX_LINE_QUANTITY, `At most ${MAX_LINE_QUANTITY} of one dish per order.`),
        pricePaise: z.number().int().min(0),
      }),
    )
    .min(1, "Your cart is empty.")
    .max(50, "Too many different dishes in one order.")
    .refine((items) => new Set(items.map((i) => i.menuItemId)).size === items.length, "Each dish may appear only once."),
});
export type CheckoutInput = z.infer<typeof checkoutSchema>;

/** `POST /api/payments/mock/[orderId]`: the two buttons on the mock payment page. */
export const mockPaymentSchema = z.object({ action: z.enum(["pay", "fail"]) });

export const orderIdSchema = z.object({ orderId: id });
