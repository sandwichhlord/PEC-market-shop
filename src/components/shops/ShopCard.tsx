import { ChevronRight, MapPin } from "lucide-react";
import Link from "next/link";
import { Pill } from "@/components/ui/Pill";
import { Rating } from "@/components/ui/Rating";
import { Thumb } from "@/components/ui/Thumb";
import type { BrowsableShop } from "@/server/shops/list";

export function ShopCard({ shop }: { shop: BrowsableShop }) {
  return (
    <Link
      href={`/shops/${shop.id}`}
      className="flex h-full items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 transition-colors hover:border-orange-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600"
    >
      <Thumb src={shop.logoUrl} alt="" />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <h2 className="truncate font-semibold text-slate-900">{shop.name}</h2>
          <Pill tone={shop.isOpen ? "green" : "grey"}>{shop.isOpen ? "Open" : "Closed"}</Pill>
        </div>
        <p className="mt-0.5 flex items-center gap-1 text-sm text-slate-500">
          <MapPin aria-hidden="true" className="size-3.5 shrink-0" />
          <span className="truncate">{shop.location}</span>
        </p>
        <div className="mt-1">
          <Rating average={shop.rating.average} count={shop.rating.count} />
        </div>
      </div>
      <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-slate-400" />
    </Link>
  );
}
