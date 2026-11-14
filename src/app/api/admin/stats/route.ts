import { NextResponse } from "next/server";
import { getAdminCounts } from "@/server/admin/stats";
import { requireRole } from "@/server/auth/guards";
import { withErrors } from "@/server/http";

/** GET /api/admin/stats → dashboard counts. Admin only. */
export const GET = withErrors(async (req: Request) => {
  await requireRole(req, "ADMIN");
  return NextResponse.json({ counts: await getAdminCounts() });
});
