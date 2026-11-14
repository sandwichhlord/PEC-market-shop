// Display labels for customer reports and account statuses, shared by the shop and admin portals.
import type { AccountStatus, ReportReason, ReportStatus, Role } from "@/generated/prisma/enums";

export const REPORT_REASON_LABEL: Record<ReportReason, string> = {
  NO_SHOW: "Did not pick up the order",
  MISBEHAVIOR: "Misbehaviour",
  OTHER: "Other",
};

export const REPORT_STATUS_LABEL: Record<ReportStatus, string> = {
  OPEN: "Open",
  ACTIONED: "Actioned",
  DISMISSED: "Dismissed",
};

export const ACCOUNT_STATUS_LABEL: Record<AccountStatus, string> = {
  ACTIVE: "Active",
  WARNED: "Warned",
  SUSPENDED: "Suspended",
};

export const ROLE_LABEL_SHORT: Record<Role, string> = {
  CUSTOMER: "Customer",
  SHOP_OWNER: "Shop owner",
  ADMIN: "Admin",
};
