import { Flag } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AccountStatusPill } from "@/components/admin/AccountStatusPill";
import { FilterTabs } from "@/components/admin/FilterTabs";
import { ModerationActions } from "@/components/admin/ModerationActions";
import { LiveRefresh } from "@/components/realtime/LiveRefresh";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { formatDateTime } from "@/lib/datetime";
import { REPORT_REASON_LABEL, REPORT_STATUS_LABEL } from "@/lib/reports";
import { REPORT_FILTERS, reportListSchema } from "@/lib/validation/admin";
import { listReports, reportCountsFor } from "@/server/reports/reports";

export const metadata: Metadata = { title: "Reports · PEC Market admin" };
export const dynamic = "force-dynamic";

const TAB_LABEL: Record<(typeof REPORT_FILTERS)[number], string> = { OPEN: "Open", ACTIONED: "Actioned", DISMISSED: "Dismissed", all: "All" };

const STATUS_TONE = {
  OPEN: "bg-orange-100 text-orange-800",
  ACTIONED: "bg-teal-100 text-teal-800",
  DISMISSED: "bg-slate-200 text-slate-700",
} as const;

export default async function AdminReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const parsed = reportListSchema.safeParse(await searchParams);
  const status = parsed.success ? parsed.data.status : "OPEN";
  const reports = await listReports({ status });
  const counts = await reportCountsFor([...new Set(reports.map((r) => r.customer.id))]);

  return (
    <>
      <LiveRefresh on={["report:changed"]} />
      <PageHeader title="Customer reports" description="Shops flag customers here. Warn, suspend or reinstate the account, or dismiss the report." />
      <FilterTabs label="Report status" tabs={REPORT_FILTERS.map((s) => ({ href: `/admin/reports?status=${s}`, label: TAB_LABEL[s], current: s === status }))} />

      {reports.length === 0 ? (
        <EmptyState icon={Flag} title={status === "OPEN" ? "No open reports" : "No reports here"}>
          {status === "OPEN" ? "When a shop reports a customer it shows up here." : "Try another filter."}
        </EmptyState>
      ) : (
        <ul className="space-y-3">
          {reports.map((r) => {
            const total = counts.get(r.customer.id) ?? 1;
            return (
              <li key={r.id} data-testid="report" data-report-status={r.status} className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold text-slate-900">{REPORT_REASON_LABEL[r.reason]}</p>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_TONE[r.status]}`}>{REPORT_STATUS_LABEL[r.status]}</span>
                </div>
                <p className="mt-1 text-sm text-slate-600">
                  By {r.shop.name}
                  {r.order && <> · order #{r.order.orderNumber}</>} · <time dateTime={r.createdAt.toISOString()}>{formatDateTime(r.createdAt)}</time>
                </p>
                <p className="mt-2 text-sm whitespace-pre-line text-slate-800">{r.description}</p>

                <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm">
                  <p className="flex flex-wrap items-center gap-2 font-medium text-slate-900">
                    {r.customer.name}
                    <AccountStatusPill status={r.customer.status} />
                  </p>
                  <p className="break-all text-slate-500">{r.customer.email}</p>
                  {total > 1 && (
                    <Link href={`/admin/users?q=${encodeURIComponent(r.customer.email)}`} className="mt-1 inline-block text-xs font-medium text-rose-700 hover:underline">
                      Reported {total} times in total
                    </Link>
                  )}
                  {r.customer.warningMessage && <p className="mt-1 text-xs text-amber-800">Current warning: “{r.customer.warningMessage}”</p>}
                </div>
                {r.adminNote && (
                  <p className="mt-2 text-sm text-slate-700">
                    <span className="font-medium">Admin note:</span> {r.adminNote}
                  </p>
                )}
                {r.status !== "DISMISSED" && (
                  <div className="mt-3">
                    <ModerationActions
                      endpoint={`/api/admin/reports/${r.id}`}
                      subjectName={r.customer.name}
                      status={r.customer.status}
                      report={{ dismissible: r.status === "OPEN" }}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
