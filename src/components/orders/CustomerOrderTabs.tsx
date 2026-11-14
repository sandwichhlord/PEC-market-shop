import Link from "next/link";
import type { CustomerOrderTab } from "@/lib/order-status";

const TABS: { tab: CustomerOrderTab; label: string }[] = [
  { tab: "active", label: "Active" },
  { tab: "past", label: "Past" },
];

/** Active / Past tabs on the customer's order history (links, so the tab lives in the URL). */
export function CustomerOrderTabs({ current, counts }: { current: CustomerOrderTab; counts: Record<CustomerOrderTab, number> }) {
  return (
    <nav aria-label="Order history" className="mb-4 flex gap-1 rounded-xl bg-slate-100 p-1">
      {TABS.map(({ tab, label }) => {
        const active = tab === current;
        return (
          <Link
            key={tab}
            href={`/orders?tab=${tab}`}
            aria-current={active ? "page" : undefined}
            className={`flex min-h-10 flex-1 items-center justify-center gap-2 rounded-lg px-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-orange-600 ${
              active ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            {label}
            <span className="rounded-full bg-slate-200 px-1.5 text-xs text-slate-700">{counts[tab]}</span>
          </Link>
        );
      })}
    </nav>
  );
}
