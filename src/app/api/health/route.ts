import { NextResponse } from "next/server";
import { isDbReachable } from "@/server/db";

// Public liveness probe: takes no input and exposes no user data, so it needs no guard.
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ ok: true, db: await isDbReachable() });
}
