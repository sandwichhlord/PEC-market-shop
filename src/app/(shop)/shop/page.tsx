import { MapPin } from "lucide-react";
import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { Thumb } from "@/components/ui/Thumb";
import { requirePageUser } from "@/server/auth/current";
import { getShopOverview } from "@/server/shops/list";

export const metadata: Metadata = { title: "Dashboard · PEC Market shop" };

export default async function ShopDashboardPage() {
  const user = await requirePageUser("SHOP_OWNER");
  const overview = await getShopOverview(user.id);
  if (!overview) {
    return <PageHeader title="Dashboard" description="No shop is linked to this account. Contact the market admin." />;
  }
  const { shop, counts } = overview;
  const stats: [string, number][] = [
    ["New orders", counts.newOrders],
    ["Preparing", counts.preparing],
    ["Ready for pickup", counts.ready],
    ["Dishes on menu", counts.dishes],
  ];
  return (
    <>
      <PageHeader title="Dashboard" />
      <section aria-label="Shop" className="mb-6 flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-4">
        <Thumb src={shop.logoUrl} alt={`${shop.name} logo`} size="lg" />
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold text-slate-900">{shop.name}</h2>
          <p className="flex items-center gap-1 text-sm text-slate-500">
            <MapPin aria-hidden="true" className="size-3.5 shrink-0" />
            {shop.location}
          </p>
          <p className={`mt-1 text-sm font-medium ${shop.isOpen ? "text-emerald-700" : "text-slate-500"}`}>
            {shop.isOpen ? "Open for orders" : "Closed"}
          </p>
        </div>
      </section>
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
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
