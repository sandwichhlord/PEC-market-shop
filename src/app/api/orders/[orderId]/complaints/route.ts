import { NextResponse } from "next/server";
import { orderIdSchema } from "@/lib/validation/checkout";
import { complaintSchema } from "@/lib/validation/disputes";
import { requireOrderAccess } from "@/server/auth/guards";
import { fileComplaint } from "@/server/disputes/customer";
import { forbidden, readJson, withErrors } from "@/server/http";

/** POST /api/orders/:orderId/complaints { description } → 201 { complaintId, order }. The order's customer only. */
export const POST = withErrors(async (req: Request, ctx: { params: Promise<{ orderId: string }> }) => {
  const { orderId } = orderIdSchema.parse(await ctx.params);
  const { user, access } = await requireOrderAccess(req, orderId);
  if (access !== "customer") throw forbidden("Only the customer who placed the order can file a complaint.");
  const { description } = complaintSchema.parse(await readJson(req));
  return NextResponse.json(await fileComplaint(orderId, user.id, description), { status: 201 });
});
