// Customer reports (SPEC §3/§6): a shop flags the customer of one of its paid orders; the admin warns, suspends or
// reinstates that customer from the report, or dismisses it.
import type { ReportStatus } from "@/generated/prisma/enums";
import type { CustomerReportInput, ReportAction, ReportListQuery } from "@/lib/validation/admin";
import { REPORT_REASON_LABEL } from "@/lib/reports";
import { prisma } from "@/server/db";
import { HttpError, notFound } from "@/server/http";
import { emit, emitNotifications } from "@/server/realtime/emit";
import { NOTIFICATION_SELECT, afterAccountAction, applyAccountAction, type AccountActionOutcome } from "@/server/admin/accounts";

const UNPAID = ["PENDING_PAYMENT", "PAYMENT_FAILED"] as const;

/** Reports a shop filed about one order, newest first (shown on the shop's order page). */
export function listOrderReports(shopId: string, orderId: string) {
  return prisma.customerReport.findMany({
    where: { shopId, orderId },
    orderBy: { createdAt: "desc" },
    select: { id: true, reason: true, description: true, status: true, adminNote: true, createdAt: true },
  });
}

/**
 * Files a report about the customer of one of the shop's paid orders. Unpaid or other shops' orders are 404 (shops
 * never see them); a second report while one is still open for the order is 409 ALREADY_REPORTED. Every admin is
 * notified.
 */
export async function createCustomerReport(shopId: string, orderId: string, input: CustomerReportInput) {
  const order = await prisma.order.findFirst({
    where: { id: orderId, shopId, status: { notIn: [...UNPAID] } },
    select: { id: true, orderNumber: true, customerId: true, shop: { select: { name: true } } },
  });
  if (!order) throw notFound("Order not found.");

  const { report, notifications } = await prisma.$transaction(async (tx) => {
    const open = await tx.customerReport.count({ where: { orderId, status: "OPEN" } });
    if (open > 0) throw new HttpError(409, "ALREADY_REPORTED", "You have already reported this customer for this order. The admin is reviewing it.");
    const report = await tx.customerReport.create({
      data: { shopId, orderId, customerId: order.customerId, reason: input.reason, description: input.description },
      select: { id: true, reason: true, description: true, status: true, adminNote: true, createdAt: true },
    });
    const admins = await tx.user.findMany({ where: { role: "ADMIN", status: { not: "SUSPENDED" } }, select: { id: true } });
    const notifications = await tx.notification.createManyAndReturn({
      data: admins.map((a) => ({
        userId: a.id,
        type: "REPORT" as const,
        title: `Customer reported by ${order.shop.name}`,
        body: `${REPORT_REASON_LABEL[input.reason]} on order ${order.orderNumber}.`,
        link: "/admin/reports",
      })),
      select: NOTIFICATION_SELECT,
    });
    return { report, notifications };
  });
  emit({ type: "report:changed", reportId: report.id, shopId });
  emitNotifications(notifications);
  return report;
}

// ---- Admin side ----

const REPORT_SELECT = {
  id: true,
  reason: true,
  description: true,
  status: true,
  adminNote: true,
  createdAt: true,
  updatedAt: true,
  shop: { select: { id: true, name: true } },
  customer: { select: { id: true, name: true, email: true, status: true, warningMessage: true } },
  order: { select: { id: true, orderNumber: true } },
} as const;

/** The reports queue: by status (default OPEN), oldest open reports first, closed ones newest first. Capped at 200. */
export function listReports({ status }: ReportListQuery) {
  return prisma.customerReport.findMany({
    where: status === "all" ? {} : { status },
    orderBy: status === "OPEN" ? { createdAt: "asc" } : { createdAt: "desc" },
    take: 200,
    select: REPORT_SELECT,
  });
}

export type AdminReport = Awaited<ReturnType<typeof listReports>>[number];

/** How many earlier reports (any shop) the same customer has, keyed by customer id. */
export async function reportCountsFor(customerIds: string[]): Promise<Map<string, number>> {
  if (customerIds.length === 0) return new Map();
  const rows = await prisma.customerReport.groupBy({ by: ["customerId"], where: { customerId: { in: customerIds } }, _count: { _all: true } });
  return new Map(rows.map((r) => [r.customerId, r._count._all]));
}

/**
 * Acts on a report. warn / suspend / reinstate apply to the reported customer and mark the report ACTIONED (allowed
 * on an already actioned report too, e.g. reinstating after a suspension); dismiss closes an OPEN report as DISMISSED.
 * The note, when given, is stored as the report's admin note.
 */
export async function actOnReport(reportId: string, action: ReportAction) {
  const outcome = await prisma.$transaction(async (tx) => {
    const report = await tx.customerReport.findUnique({ where: { id: reportId }, select: { id: true, status: true, customerId: true, shopId: true } });
    if (!report) throw notFound("Report not found.");

    let account: AccountActionOutcome | null = null;
    let status: ReportStatus;
    if (action.action === "dismiss") {
      if (report.status === "DISMISSED") return { changed: false, account, report };
      if (report.status !== "OPEN") throw new HttpError(409, "REPORT_CLOSED", "This report has already been actioned.");
      status = "DISMISSED";
    } else {
      if (report.status === "DISMISSED") throw new HttpError(409, "REPORT_CLOSED", "This report was dismissed.");
      account = await applyAccountAction(tx, report.customerId, action);
      status = "ACTIONED";
    }
    const { count } = await tx.customerReport.updateMany({
      where: { id: reportId, status: report.status },
      data: { status, ...(action.note ? { adminNote: action.note } : {}) },
    });
    if (count === 0) throw new HttpError(409, "REPORT_CHANGED", "This report was just updated by someone else. Refresh and try again.");
    return { changed: true, account, report };
  });

  if (outcome.account) afterAccountAction(outcome.account);
  if (outcome.changed) emit({ type: "report:changed", reportId, shopId: outcome.report.shopId });
  const report = await prisma.customerReport.findUniqueOrThrow({ where: { id: reportId }, select: REPORT_SELECT });
  return { changed: outcome.changed || Boolean(outcome.account?.changed), report };
}
