import { ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { LiveRefresh } from "@/components/realtime/LiveRefresh";
import { PageHeader } from "@/components/ui/PageHeader";
import { getAdminCounts } from "@/server/admin/stats";

export const metadata: Metadata = { title: "Admin · PEC Market" };
export const dynamic = "force-dynamic";

interface Stat {
  label: string;
  value: number;
  href: string;
  /** Highlight when non-zero (something needs the admin's attention). */
  attention?: boolean;
}

export default async function AdminDashboardPage() {
  const c = await getAdminCounts();
  const stats: Stat[] = [
    { label: "Escalated disputes", value: c.escalatedDisputes, href: "/admin/disputes?status=ESCALATED", attention: true },
    { label: "Open disputes", value: c.openDisputes, href: "/admin/disputes" },
    { label: "Open reports", value: c.openReports, href: "/admin/reports", attention: true },
    { label: "Paid orders today", value: c.ordersToday, href: "/admin/shops" },
    { label: "Customers", value: c.customers, href: "/admin/users?role=CUSTOMER" },
    { label: "Shops", value: c.shops, href: "/admin/shops" },
    { label: "Warned accounts", value: c.warned, href: "/admin/users?status=WARNED" },
    { label: "Suspended accounts", value: c.suspended, href: "/admin/users?status=SUSPENDED" },
  ];
  return (
    <>
      <LiveRefresh on={["order:status", "report:changed"]} />
      <PageHeader title="Dashboard" description="Market activity at a glance." />
      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => {
          const hot = s.attention && s.value > 0;
          return (
            <li key={s.label}>
              <Link
                href={s.href}
                data-testid="stat"
                className={`group flex h-full flex-col rounded-xl border bg-white p-4 hover:border-slate-300 focus-visible:outline-2 focus-visible:outline-orange-600 ${
                  hot ? "border-rose-300" : "border-slate-200"
                }`}
              >
                <span className="flex items-start justify-between gap-1 text-sm text-slate-500">
                  {s.label}
                  <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-slate-400 group-hover:text-slate-600" />
                </span>
                <span className={`mt-1 text-2xl font-bold tabular-nums ${hot ? "text-rose-700" : "text-slate-900"}`}>{s.value}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}
