import Link from "next/link";

export interface FilterTab {
  href: string;
  label: string;
  count?: number;
  current: boolean;
}

/** Link-based filter tabs (the filter lives in the URL), scrollable on narrow screens. */
export function FilterTabs({ label, tabs }: { label: string; tabs: FilterTab[] }) {
  return (
    <nav aria-label={label} className="mb-4 flex gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1">
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          aria-current={tab.current ? "page" : undefined}
          className={`flex min-h-10 flex-1 items-center justify-center gap-2 rounded-lg px-3 text-sm font-semibold whitespace-nowrap focus-visible:outline-2 focus-visible:outline-orange-600 ${
            tab.current ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
          }`}
        >
          {tab.label}
          {tab.count !== undefined && <span className="rounded-full bg-slate-200 px-1.5 text-xs text-slate-700">{tab.count}</span>}
        </Link>
      ))}
    </nav>
  );
}
