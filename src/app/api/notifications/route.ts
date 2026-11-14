import { NextResponse } from "next/server";
import { requireUser } from "@/server/auth/guards";
import { withErrors } from "@/server/http";
import { countUnread, listNotifications } from "@/server/notifications/list";

/** GET /api/notifications → { notifications (50 newest), unreadCount } for the signed-in user (any role). */
export const GET = withErrors(async (req: Request) => {
  const user = await requireUser(req);
  const [notifications, unreadCount] = await Promise.all([listNotifications(user.id), countUnread(user.id)]);
  return NextResponse.json({ notifications, unreadCount });
});
