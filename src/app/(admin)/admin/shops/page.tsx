import { MapPin, Search, Store } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AccountStatusPill } from "@/components/admin/AccountStatusPill";
import { ModerationActions } from "@/components/admin/ModerationActions";
import { buttonClasses } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { Pill } from "@/components/ui/Pill";
import { Rating } from "@/components/ui/Rating";
import { Thumb } from "@/components/ui/Thumb";
import { shopListSchema } from "@/lib/validation/admin";
import { listShops } from "@/server/admin/directory";

export const metadata: Metadata = { title: "Shops · PEC Market admin" };
export const dynamic = "force-dynamic";

export default async function AdminShopsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const parsed = shopListSchema.safeParse(await searchParams);
  const q = parsed.success ? parsed.data.q : undefined;
  const shops = await listShops({ q });

  return (
    <>
      <PageHeader title="Shops" description="Every shop in the market. Suspending an owner hides their shop from customers." />
      <form method="get" role="search" className="mb-4 flex gap-2">
        <label className="min-w-0 flex-1">
          <span className="sr-only">Search shops by name</span>
          <input
            type="search"
            name="q"
            defaultValue={q ?? ""}
            maxLength={80}
            placeholder="Search shops by name"
            className="block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 focus:outline-2 focus:outline-orange-600 sm:text-sm"
          />
        </label>
        <button type="submit" className={buttonClasses("secondary")}>
          <Search aria-hidden="true" className="size-4" />
          <span className="sr-only sm:not-sr-only">Search</span>
        </button>
      </form>

      {shops.length === 0 ? (
        <EmptyState icon={Store} title="No shops found">
          {q ? "Try a different name." : "Shops appear here once owners sign up."}
        </EmptyState>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {shops.map((s) => (
            <li key={s.id} data-testid="admin-shop" className="flex flex-col rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex gap-3">
                <Thumb src={s.logoUrl} alt={`${s.name} logo`} size="md" />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-semibold text-slate-900">
                    {s.name}
                    <Pill tone={s.isOpen ? "green" : "grey"}>{s.isOpen ? "Open" : "Closed"}</Pill>
                    {s.owner.status === "SUSPENDED" && <Pill tone="red">Hidden</Pill>}
                  </p>
                  <p className="flex items-center gap-1 text-sm text-slate-500">
                    <MapPin aria-hidden="true" className="size-3.5 shrink-0" />
                    <span className="min-w-0 break-words">{s.location}</span>
                  </p>
                  <Rating average={s.rating.average} count={s.rating.count} />
                </div>
              </div>
              <dl className="mt-3 grid grid-cols-3 gap-2 text-center text-sm">
                <div className="rounded-lg bg-slate-50 p-2">
                  <dt className="text-xs text-slate-500">Paid orders</dt>
                  <dd className="font-semibold tabular-nums">{s._count.orders}</dd>
                </div>
                <div className="rounded-lg bg-slate-50 p-2">
                  <dt className="text-xs text-slate-500">Dishes</dt>
                  <dd className="font-semibold tabular-nums">{s._count.menuItems}</dd>
                </div>
                <div className={`rounded-lg p-2 ${s.activeDisputes > 0 ? "bg-rose-50" : "bg-slate-50"}`}>
                  <dt className="text-xs text-slate-500">Open disputes</dt>
                  <dd className="font-semibold tabular-nums">
                    {s.activeDisputes > 0 ? (
                      <Link href={`/admin/disputes?shopId=${s.id}`} className="text-rose-700 hover:underline">
                        {s.activeDisputes}
                      </Link>
                    ) : (
                      0
                    )}
                  </dd>
                </div>
              </dl>
              <div className="mt-3 border-t border-slate-100 pt-3 text-sm">
                <p className="flex flex-wrap items-center gap-2 text-slate-800">
                  Owner: {s.owner.name} <AccountStatusPill status={s.owner.status} />
                </p>
                <p className="break-all text-slate-500">{s.owner.email}</p>
                {s.owner.warningMessage && <p className="mt-1 text-xs text-amber-800">Warning: “{s.owner.warningMessage}”</p>}
                <div className="mt-3">
                  <ModerationActions endpoint={`/api/admin/users/${s.owner.id}`} subjectName={s.owner.name} status={s.owner.status} />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
