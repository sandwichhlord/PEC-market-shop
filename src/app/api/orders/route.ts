import { NextResponse } from "next/server";
import { customerOrderTabSchema } from "@/lib/validation/orders";
import { requireRole } from "@/server/auth/guards";
import { withErrors } from "@/server/http";
import { countCustomerOrders, listCustomerOrders } from "@/server/orders/history";

/** GET /api/orders?tab=active|past → { tab, orders, counts }: the signed-in customer's own orders, newest first. */
export const GET = withErrors(async (req: Request) => {
  const user = await requireRole(req, "CUSTOMER");
  const { tab } = customerOrderTabSchema.parse({ tab: new URL(req.url).searchParams.get("tab") ?? undefined });
  const [orders, counts] = await Promise.all([listCustomerOrders(user.id, tab), countCustomerOrders(user.id)]);
  return NextResponse.json({ tab, orders, counts });
});
