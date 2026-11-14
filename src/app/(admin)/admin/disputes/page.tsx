import { ChevronRight, Scale } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { FilterTabs } from "@/components/admin/FilterTabs";
import { LiveRefresh } from "@/components/realtime/LiveRefresh";
import { buttonClasses } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatDateTime } from "@/lib/datetime";
import { formatPaise } from "@/lib/money";
import { COMPLAINT_TYPE_LABEL } from "@/lib/order-status";
import { disputeListSchema, type DisputeFilter, type DisputeListQuery } from "@/lib/validation/admin";
import { listDisputes } from "@/server/admin/disputes";
import { shopOptions } from "@/server/admin/directory";
import { DisputeStatusPill } from "@/components/admin/DisputeStatusPill";

export const metadata: Metadata = { title: "Disputes · PEC Market admin" };
export const dynamic = "force-dynamic";

const TABS: { status: DisputeFilter; label: string }[] = [
  { status: "active", label: "Needs action" },
  { status: "ESCALATED", label: "Escalated" },
  { status: "OPEN", label: "With shop" },
  { status: "RESOLVED", label: "Resolved" },
  { status: "REJECTED", label: "Rejected" },
  { status: "all", label: "All" },
];

function hrefFor(query: DisputeListQuery, status: DisputeFilter) {
  const params = new URLSearchParams({ status });
  if (query.shopId) params.set("shopId", query.shopId);
  if (query.type) params.set("type", query.type);
  return `/admin/disputes?${params}`;
}

const select =
  "block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 focus:outline-2 focus:outline-orange-600 sm:text-sm";

export default async function AdminDisputesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const parsed = disputeListSchema.safeParse(await searchParams);
  const query: DisputeListQuery = parsed.success ? parsed.data : { status: "active" };
  const [disputes, shops] = await Promise.all([listDisputes(query), shopOptions()]);

  return (
    <>
      <LiveRefresh on={["order:status"]} />
      <PageHeader title="Disputes" description="Refund requests and complaints from every shop. Escalated ones need your decision." />
      <FilterTabs label="Dispute status" tabs={TABS.map((t) => ({ href: hrefFor(query, t.status), label: t.label, current: t.status === query.status }))} />

      <form method="get" className="mb-4 grid gap-3 rounded-xl border border-slate-200 bg-white p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <input type="hidden" name="status" value={query.status} />
        <label className="space-y-1.5 text-sm font-medium text-slate-700">
          <span>Shop</span>
          <select name="shopId" defaultValue={query.shopId ?? ""} className={select}>
            <option value="">All shops</option>
            {shops.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1.5 text-sm font-medium text-slate-700">
          <span>Type</span>
          <select name="type" defaultValue={query.type ?? ""} className={select}>
            <option value="">Refunds and complaints</option>
            <option value="REFUND">Refund requests</option>
            <option value="COMPLAINT">Complaints</option>
          </select>
        </label>
        <button type="submit" className={buttonClasses("secondary")}>
          Apply filters
        </button>
      </form>

      {disputes.length === 0 ? (
        <EmptyState icon={Scale} title="No disputes here">
          {query.status === "active" ? "Nothing needs your attention right now." : "Try another filter."}
        </EmptyState>
      ) : (
        <ul className="space-y-3">
          {disputes.map((d) => (
            <li key={d.id}>
              <Link
                href={`/admin/disputes/${d.id}`}
                data-testid="admin-dispute"
                data-dispute-status={d.status}
                className="block rounded-xl border border-slate-200 bg-white p-4 hover:border-slate-300 focus-visible:outline-2 focus-visible:outline-orange-600"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold text-slate-900">
                    {COMPLAINT_TYPE_LABEL[d.type]}
                    {d.refundAmountPaise !== null && <> · {formatPaise(d.refundAmountPaise)}</>}
                    <span className="font-normal text-slate-500"> · Order #{d.order.orderNumber}</span>
                  </p>
                  <div className="flex items-center gap-2">
                    <DisputeStatusPill status={d.status} />
                    <ChevronRight aria-hidden="true" className="size-4 text-slate-400" />
                  </div>
                </div>
                <p className="mt-1 text-sm text-slate-600">
                  {d.order.shop.name} · {d.raisedBy.name} ·{" "}
                  <time dateTime={d.createdAt.toISOString()}>{formatDateTime(d.createdAt)}</time>
                </p>
                <p className="mt-2 line-clamp-2 text-sm text-slate-700">{d.description}</p>
                {d.shopResponse && <p className="mt-1 line-clamp-2 text-sm text-slate-500">Shop: {d.shopResponse}</p>}
                <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                  Order now <StatusBadge status={d.order.status} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
