import { prisma } from "@/server/db";

/** The user's most recent notifications, newest first. */
export function listNotifications(userId: string, take = 50) {
  return prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take,
    select: { id: true, title: true, body: true, link: true, readAt: true, createdAt: true },
  });
}
