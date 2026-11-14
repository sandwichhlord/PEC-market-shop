// Checkout (SPEC §3): re-validate the cart against the database, create the order in PENDING_PAYMENT with price
// snapshots, then start a hosted checkout with the payment provider.
import { randomInt } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import type { CheckoutInput } from "@/lib/validation/checkout";
import { prisma } from "@/server/db";
import { HttpError } from "@/server/http";
import { currency } from "@/server/payments";
import type { PaymentProvider } from "@/server/payments/types";
import { markOrderPaymentFailed } from "./payment";

// No 0/O/1/I so order numbers can be read out at the counter.
const ORDER_NUMBER_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
export const ORDER_NUMBER_PATTERN = /^PEC[2-9A-HJ-NP-Z]{6}$/;

/** A short human order id like "PEC7K3QXM". */
export function generateOrderNumber(): string {
  let out = "PEC";
  for (let i = 0; i < 6; i++) out += ORDER_NUMBER_ALPHABET[randomInt(ORDER_NUMBER_ALPHABET.length)];
  return out;
}

export interface CheckoutCustomer {
  id: string;
  email: string;
}

export interface CheckoutStarted {
  orderId: string;
  orderNumber: string;
  totalPaise: number;
  checkoutUrl: string;
}

const conflict = (code: string, message: string, extra: Record<string, unknown> = {}) =>
  new HttpError(409, code, message, extra);

const isUniqueViolation = (err: unknown) => err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";

type Tx = Prisma.TransactionClient;

/** Checks the cart against current data and returns the lines to snapshot. Throws 404/409 with details. */
async function validateCart(tx: Tx, input: CheckoutInput) {
  const shop = await tx.shop.findFirst({
    where: { id: input.shopId, owner: { status: { not: "SUSPENDED" } } },
    select: { id: true, name: true, isOpen: true },
  });
  if (!shop) throw new HttpError(404, "SHOP_NOT_FOUND", "This shop is no longer available.");
  if (!shop.isOpen) throw conflict("SHOP_CLOSED", `${shop.name} is closed right now. Try again when it opens.`);

  const ids = input.items.map((i) => i.menuItemId);
  const dishes = await tx.menuItem.findMany({
    where: { id: { in: ids }, shopId: shop.id, isArchived: false },
    select: { id: true, name: true, pricePaise: true, inStock: true },
  });
  const byId = new Map(dishes.map((d) => [d.id, d]));

  const missing = ids.filter((id) => !byId.has(id));
  if (missing.length > 0) {
    throw conflict("ITEM_UNAVAILABLE", "Some dishes in your cart are no longer on the menu. Remove them and try again.", {
      menuItemIds: missing,
    });
  }
  const outOfStock = dishes.filter((d) => !d.inStock);
  if (outOfStock.length > 0) {
    throw conflict("OUT_OF_STOCK", `Out of stock: ${outOfStock.map((d) => d.name).join(", ")}.`, {
      menuItemIds: outOfStock.map((d) => d.id),
    });
  }
  const changed = input.items.filter((i) => byId.get(i.menuItemId)!.pricePaise !== i.pricePaise);
  if (changed.length > 0) {
    throw conflict("PRICE_CHANGED", "Prices have changed since you added these dishes. Check your cart and try again.", {
      prices: changed.map((i) => {
        const dish = byId.get(i.menuItemId)!;
        return { menuItemId: dish.id, name: dish.name, pricePaise: dish.pricePaise };
      }),
    });
  }

  const lines = input.items.map((i) => {
    const dish = byId.get(i.menuItemId)!;
    return { menuItemId: dish.id, nameAtOrder: dish.name, quantity: i.quantity, pricePaiseAtOrder: dish.pricePaise };
  });
  return { shop, lines };
}

async function createPendingOrder(customerId: string, input: CheckoutInput) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        const { shop, lines } = await validateCart(tx, input);
        const totalPaise = lines.reduce((sum, l) => sum + l.pricePaiseAtOrder * l.quantity, 0);
        const order = await tx.order.create({
          data: {
            orderNumber: generateOrderNumber(),
            customerId,
            shopId: shop.id,
            status: "PENDING_PAYMENT",
            paymentStatus: "PENDING",
            totalPaise,
            items: { create: lines },
            // Creation is the first timeline entry (DECISIONS P02: fromStatus null → PENDING_PAYMENT).
            events: { create: { fromStatus: null, toStatus: "PENDING_PAYMENT", actorId: customerId } },
          },
          select: { id: true, orderNumber: true, totalPaise: true },
        });
        return { order, shop, lines };
      });
    } catch (err) {
      // An order number collision is astronomically rare; just draw another one.
      if (isUniqueViolation(err) && attempt < 4) continue;
      throw err;
    }
  }
}

/**
 * Creates a PENDING_PAYMENT order from the cart and a checkout session for it. If the provider cannot start the
 * checkout, the order is marked PAYMENT_FAILED (so it never lingers as pending) and a 502 is thrown.
 */
export async function startCheckout(
  customer: CheckoutCustomer,
  input: CheckoutInput,
  provider: PaymentProvider,
): Promise<CheckoutStarted> {
  const { order, shop, lines } = await createPendingOrder(customer.id, input);

  let session;
  try {
    session = await provider.createCheckout({
      id: order.id,
      orderNumber: order.orderNumber,
      shopName: shop.name,
      customerEmail: customer.email,
      currency: currency(),
      items: lines.map((l) => ({ name: l.nameAtOrder, unitAmountPaise: l.pricePaiseAtOrder, quantity: l.quantity })),
    });
  } catch (err) {
    console.error("[checkout] payment provider failed to create a checkout", err);
    await markOrderPaymentFailed(order.id, "Payment could not be started.");
    throw new HttpError(502, "PAYMENT_PROVIDER_ERROR", "We couldn't start the payment. Your cart is saved — please try again.");
  }

  await prisma.order.update({ where: { id: order.id }, data: { stripeCheckoutSessionId: session.sessionId } });
  return { orderId: order.id, orderNumber: order.orderNumber, totalPaise: order.totalPaise, checkoutUrl: session.url };
}

/** The order a Stripe webhook is about: by checkout session id, else by the `orderId` metadata. */
export async function findOrderIdForSession(sessionId: string, orderIdHint: string | null): Promise<string | null> {
  const bySession = await prisma.order.findUnique({ where: { stripeCheckoutSessionId: sessionId }, select: { id: true } });
  if (bySession) return bySession.id;
  if (!orderIdHint) return null;
  // Only trust the metadata for an order that has no other session recorded.
  const byId = await prisma.order.findUnique({ where: { id: orderIdHint }, select: { id: true, stripeCheckoutSessionId: true } });
  return byId && byId.stripeCheckoutSessionId === null ? byId.id : null;
}
