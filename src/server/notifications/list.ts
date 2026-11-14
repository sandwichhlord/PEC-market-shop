import { prisma } from "@/server/db";

export const NOTIFICATION_SELECT = {
  id: true,
  type: true,
  title: true,
  body: true,
  link: true,
  readAt: true,
  createdAt: true,
} as const;

/** The user's most recent notifications, newest first. */
export function listNotifications(userId: string, take = 50) {
  return prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take, select: NOTIFICATION_SELECT });
}

export function countUnread(userId: string): Promise<number> {
  return prisma.notification.count({ where: { userId, readAt: null } });
}

/**
 * Marks some of the user's notifications (or all of them) read. Ids that are not the user's are ignored, and
 * already-read ones keep their original readAt. Returns the new unread count.
 */
export async function markNotificationsRead(userId: string, target: { all: true } | { ids: string[] }): Promise<number> {
  await prisma.notification.updateMany({
    where: { userId, readAt: null, ...("ids" in target ? { id: { in: target.ids } } : {}) },
    data: { readAt: new Date() },
  });
  return countUnread(userId);
}
