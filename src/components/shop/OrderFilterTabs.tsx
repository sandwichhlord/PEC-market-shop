import Link from "next/link";
import type { ShopOrderFilter } from "@/lib/order-status";

const TABS: { filter: ShopOrderFilter; label: string }[] = [
  { filter: "active", label: "Active" },
  { filter: "completed", label: "Completed" },
  { filter: "disputes", label: "Disputes" },
];

/** Active / Completed / Disputes filter for the shop's orders dashboard (links, so the filter lives in the URL). */
export function OrderFilterTabs({ current, counts }: { current: ShopOrderFilter; counts: Record<ShopOrderFilter, number> }) {
  return (
    <nav aria-label="Order filter" className="mb-4 flex gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1">
      {TABS.map(({ filter, label }) => {
        const active = filter === current;
        return (
          <Link
            key={filter}
            href={`/shop/orders?filter=${filter}`}
            aria-current={active ? "page" : undefined}
            className={`flex min-h-10 flex-1 items-center justify-center gap-2 rounded-lg px-3 text-sm font-semibold whitespace-nowrap focus-visible:outline-2 focus-visible:outline-orange-600 ${
              active ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            {label}
            <span
              className={`rounded-full px-1.5 text-xs ${
                filter === "disputes" && counts.disputes > 0 ? "bg-rose-100 text-rose-700" : "bg-slate-200 text-slate-700"
              }`}
            >
              {counts[filter]}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
