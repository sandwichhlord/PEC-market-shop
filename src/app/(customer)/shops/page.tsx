import { MapPin, Store } from "lucide-react";
import type { Metadata } from "next";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { Thumb } from "@/components/ui/Thumb";
import { listBrowsableShops } from "@/server/shops/list";

export const metadata: Metadata = { title: "Shops · PEC Market" };
export const dynamic = "force-dynamic";

export default async function ShopsPage() {
  const shops = await listBrowsableShops();
  return (
    <>
      <PageHeader title="Shops" description="Everything cooking in the PEC market." />
      {shops.length === 0 ? (
        <EmptyState icon={Store} title="No shops yet">
          Shops will appear here as soon as they register.
        </EmptyState>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {shops.map((shop) => (
            <li key={shop.id} className="flex gap-3 rounded-xl border border-slate-200 bg-white p-3">
              <Thumb src={shop.logoUrl} alt={`${shop.name} logo`} />
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="truncate font-semibold text-slate-900">{shop.name}</h2>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                      shop.isOpen ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {shop.isOpen ? "Open" : "Closed"}
                  </span>
                </div>
                <p className="mt-0.5 flex items-center gap-1 text-sm text-slate-500">
                  <MapPin aria-hidden="true" className="size-3.5 shrink-0" />
                  <span className="truncate">{shop.location}</span>
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
