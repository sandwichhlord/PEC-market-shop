import type { AccountStatus } from "@/generated/prisma/enums";
import { ACCOUNT_STATUS_LABEL } from "@/lib/reports";

const TONE: Record<AccountStatus, string> = {
  ACTIVE: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  WARNED: "bg-amber-50 text-amber-800 ring-amber-200",
  SUSPENDED: "bg-red-50 text-red-700 ring-red-200",
};

/** Active / Warned / Suspended label for an account. */
export function AccountStatusPill({ status }: { status: AccountStatus }) {
  return (
    <span
      data-account-status={status}
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset ${TONE[status]}`}
    >
      {ACCOUNT_STATUS_LABEL[status]}
    </span>
  );
}
