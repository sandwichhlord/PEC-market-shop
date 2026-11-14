import { NextResponse } from "next/server";
import { customerReportSchema } from "@/lib/validation/admin";
import { shopOrderParamsSchema } from "@/lib/validation/shop-portal";
import { requireShopOwner } from "@/server/auth/guards";
import { readJson, withErrors } from "@/server/http";
import { createCustomerReport, listOrderReports } from "@/server/reports/reports";

type Ctx = { params: Promise<{ shopId: string; orderId: string }> };

/** GET → { reports } this shop filed about the order's customer. Shop owner only. */
export const GET = withErrors(async (req: Request, ctx: Ctx) => {
  const { shopId, orderId } = shopOrderParamsSchema.parse(await ctx.params);
  await requireShopOwner(req, shopId);
  return NextResponse.json({ reports: await listOrderReports(shopId, orderId) });
});

/** POST { reason: NO_SHOW | MISBEHAVIOR | OTHER, description } → 201 { report }. Shop owner only; paid orders of the shop. */
export const POST = withErrors(async (req: Request, ctx: Ctx) => {
  const { shopId, orderId } = shopOrderParamsSchema.parse(await ctx.params);
  await requireShopOwner(req, shopId);
  const input = customerReportSchema.parse(await readJson(req));
  return NextResponse.json({ report: await createCustomerReport(shopId, orderId, input) }, { status: 201 });
});
