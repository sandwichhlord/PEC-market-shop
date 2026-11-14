import { NextResponse } from "next/server";
import { checkoutSchema } from "@/lib/validation/checkout";
import { requireRole } from "@/server/auth/guards";
import { readJson, withErrors } from "@/server/http";
import { startCheckout } from "@/server/orders/checkout";
import { getPaymentProvider } from "@/server/payments";

/**
 * POST JSON { shopId, items: [{ menuItemId, quantity, pricePaise }] } → 201 { orderId, orderNumber, totalPaise,
 * checkoutUrl }. Customers only. Re-validates the shop (open), every dish (on the menu, in stock) and every price;
 * 409 SHOP_CLOSED / ITEM_UNAVAILABLE / OUT_OF_STOCK / PRICE_CHANGED otherwise.
 */
export const POST = withErrors(async (req: Request) => {
  const user = await requireRole(req, "CUSTOMER");
  const input = checkoutSchema.parse(await readJson(req));
  const started = await startCheckout(user, input, getPaymentProvider());
  return NextResponse.json(started, { status: 201 });
});
