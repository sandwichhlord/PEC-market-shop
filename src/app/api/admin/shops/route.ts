import { NextResponse } from "next/server";
import { shopListSchema } from "@/lib/validation/admin";
import { listShops } from "@/server/admin/directory";
import { requireRole } from "@/server/auth/guards";
import { withErrors } from "@/server/http";

/** GET /api/admin/shops?q= → { shops } with owner, counts and rating. Admin only. */
export const GET = withErrors(async (req: Request) => {
  await requireRole(req, "ADMIN");
  const query = shopListSchema.parse(Object.fromEntries(new URL(req.url).searchParams));
  return NextResponse.json({ shops: await listShops(query) });
});
