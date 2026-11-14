import type { Metadata } from "next";
import { LiveRefresh } from "@/components/realtime/LiveRefresh";
import { PageHeader } from "@/components/ui/PageHeader";
import { getAdminCounts } from "@/server/admin/stats";

export const metadata: Metadata = { title: "Admin · PEC Market" };
export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  const c = await getAdminCounts();
  const stats: [string, number][] = [
    ["Customers", c.customers],
    ["Shops", c.shops],
    ["Paid orders today", c.ordersToday],
    ["Open disputes", c.openDisputes],
    ["Open reports", c.openReports],
    ["Suspended accounts", c.suspended],
  ];
  return (
    <>
      <LiveRefresh on={["order:status"]} />
      <PageHeader title="Dashboard" description="Market activity at a glance." />
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {stats.map(([label, value]) => (
          <div key={label} className="rounded-xl border border-slate-200 bg-white p-4">
            <dt className="text-sm text-slate-500">{label}</dt>
            <dd className="mt-1 text-2xl font-bold text-slate-900">{value}</dd>
          </div>
        ))}
      </dl>
    </>
  );
}
