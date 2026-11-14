import { NextResponse } from "next/server";
import { shopSearchSchema } from "@/lib/validation/shops";
import { requireUser } from "@/server/auth/guards";
import { withErrors } from "@/server/http";
import { listBrowsableShops } from "@/server/shops/list";

/** GET /api/shops?q= — browsable shops with rating and open/closed state. Any signed-in user. */
export const GET = withErrors(async (req: Request) => {
  await requireUser(req);
  const { q } = shopSearchSchema.parse({ q: new URL(req.url).searchParams.get("q") ?? undefined });
  return NextResponse.json({ shops: await listBrowsableShops({ q }) });
});
