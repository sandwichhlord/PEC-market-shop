import type { ComplaintStatus } from "@/generated/prisma/enums";

const LABEL: Record<ComplaintStatus, string> = {
  OPEN: "With the shop",
  ESCALATED: "Escalated",
  RESOLVED: "Resolved",
  REJECTED: "Rejected",
};

const TONE: Record<ComplaintStatus, string> = {
  OPEN: "bg-orange-100 text-orange-800",
  ESCALATED: "bg-rose-100 text-rose-800",
  RESOLVED: "bg-teal-100 text-teal-800",
  REJECTED: "bg-slate-200 text-slate-700",
};

/** A dispute's status as the admin sees it. */
export function DisputeStatusPill({ status }: { status: ComplaintStatus }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${TONE[status]}`}>{LABEL[status]}</span>;
}
