import { prisma } from "@/server/db";

/** Headline counts for the admin dashboard. */
export async function getAdminCounts() {
  const [customers, shops, suspended, warned, ordersToday, openDisputes, escalatedDisputes, openReports] = await Promise.all([
    prisma.user.count({ where: { role: "CUSTOMER" } }),
    prisma.shop.count(),
    prisma.user.count({ where: { status: "SUSPENDED" } }),
    prisma.user.count({ where: { status: "WARNED" } }),
    prisma.order.count({ where: { createdAt: { gte: startOfTodayIST() }, status: { notIn: ["PENDING_PAYMENT", "PAYMENT_FAILED"] } } }),
    prisma.complaint.count({ where: { status: { in: ["OPEN", "ESCALATED"] } } }),
    prisma.complaint.count({ where: { status: "ESCALATED" } }),
    prisma.customerReport.count({ where: { status: "OPEN" } }),
  ]);
  return { customers, shops, suspended, warned, ordersToday, openDisputes, escalatedDisputes, openReports };
}

export type AdminCounts = Awaited<ReturnType<typeof getAdminCounts>>;

/** Midnight today in India (the market's time zone, UTC+5:30, no DST), as a UTC instant. */
export function startOfTodayIST(now = new Date()): Date {
  const offsetMs = 330 * 60_000;
  const ist = new Date(now.getTime() + offsetMs);
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()) - offsetMs);
}
