import { MapPin } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ShopOpenToggle } from "@/components/shop/ShopOpenToggle";
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
  const stats: [string, number, string][] = [
    ["New orders", counts.newOrders, "/shop/orders"],
    ["Preparing", counts.preparing, "/shop/orders"],
    ["Ready for pickup", counts.ready, "/shop/orders"],
    ["Dishes on menu", counts.dishes, "/shop/menu"],
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
          <ShopOpenToggle shopId={shop.id} isOpen={shop.isOpen} />
        </div>
      </section>
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map(([label, value, href]) => (
          <div key={label} className="relative rounded-xl border border-slate-200 bg-white p-4 hover:border-orange-300 has-focus-visible:outline-2 has-focus-visible:outline-orange-600">
            <dt className="text-sm text-slate-500">
              {/* The link covers the whole card. */}
              <Link href={href} className="outline-none after:absolute after:inset-0">
                {label}
              </Link>
            </dt>
            <dd className="mt-1 text-2xl font-bold text-slate-900">{value}</dd>
          </div>
        ))}
      </dl>
    </>
  );
}
