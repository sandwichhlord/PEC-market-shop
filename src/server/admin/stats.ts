import { prisma } from "@/server/db";

/** Headline counts for the admin dashboard. */
export async function getAdminCounts() {
  const [customers, shops, suspended, ordersToday, openDisputes, openReports] = await Promise.all([
    prisma.user.count({ where: { role: "CUSTOMER" } }),
    prisma.shop.count(),
    prisma.user.count({ where: { status: "SUSPENDED" } }),
    prisma.order.count({ where: { createdAt: { gte: startOfToday() }, paymentStatus: { not: "PENDING" } } }),
    prisma.complaint.count({ where: { status: { in: ["OPEN", "ESCALATED"] } } }),
    prisma.customerReport.count({ where: { status: "OPEN" } }),
  ]);
  return { customers, shops, suspended, ordersToday, openDisputes, openReports };
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
