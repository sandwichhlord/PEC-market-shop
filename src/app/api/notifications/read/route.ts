import { NextResponse } from "next/server";
import { markReadSchema } from "@/lib/validation/notifications";
import { requireUser } from "@/server/auth/guards";
import { readJson, withErrors } from "@/server/http";
import { markNotificationsRead } from "@/server/notifications/list";

/** POST /api/notifications/read { ids: [...] } | { all: true } → { unreadCount }. Only the user's own notifications change. */
export const POST = withErrors(async (req: Request) => {
  const user = await requireUser(req);
  const target = markReadSchema.parse(await readJson(req));
  return NextResponse.json({ unreadCount: await markNotificationsRead(user.id, target) });
});
