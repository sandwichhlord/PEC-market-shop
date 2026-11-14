import { NextResponse } from "next/server";
import { disputeListSchema } from "@/lib/validation/admin";
import { listDisputes } from "@/server/admin/disputes";
import { requireRole } from "@/server/auth/guards";
import { withErrors } from "@/server/http";

/** GET /api/admin/disputes?status=active|OPEN|ESCALATED|RESOLVED|REJECTED|all&shopId=&type=REFUND|COMPLAINT. Admin only. */
export const GET = withErrors(async (req: Request) => {
  await requireRole(req, "ADMIN");
  const query = disputeListSchema.parse(Object.fromEntries(new URL(req.url).searchParams));
  return NextResponse.json({ disputes: await listDisputes(query) });
});
