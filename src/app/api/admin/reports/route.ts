import { NextResponse } from "next/server";
import { reportListSchema } from "@/lib/validation/admin";
import { requireRole } from "@/server/auth/guards";
import { withErrors } from "@/server/http";
import { listReports } from "@/server/reports/reports";

/** GET /api/admin/reports?status=OPEN|ACTIONED|DISMISSED|all (default OPEN). Admin only. */
export const GET = withErrors(async (req: Request) => {
  await requireRole(req, "ADMIN");
  const query = reportListSchema.parse(Object.fromEntries(new URL(req.url).searchParams));
  return NextResponse.json({ reports: await listReports(query) });
});
