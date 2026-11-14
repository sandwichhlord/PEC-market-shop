import { SearchX, Store } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ShopCard } from "@/components/shops/ShopCard";
import { ShopSearch } from "@/components/shops/ShopSearch";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { shopSearchSchema } from "@/lib/validation/shops";
import { listBrowsableShops } from "@/server/shops/list";

export const metadata: Metadata = { title: "Shops · PEC Market" };
export const dynamic = "force-dynamic";

export default async function ShopsPage({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  const raw = (await searchParams).q;
  const parsed = shopSearchSchema.safeParse({ q: Array.isArray(raw) ? raw[0] : raw });
  const q = parsed.success ? parsed.data.q : undefined;
  const shops = await listBrowsableShops({ q });

  return (
    <>
      <PageHeader title="Shops" description="Everything cooking in the PEC market." />
      <ShopSearch initialQuery={q ?? ""} />
      {shops.length === 0 ? (
        q ? (
          <EmptyState icon={SearchX} title={`No shops match “${q}”`}>
            <Link href="/shops" className="font-medium text-orange-700 underline-offset-2 hover:underline">
              Clear search
            </Link>
          </EmptyState>
        ) : (
          <EmptyState icon={Store} title="No shops yet">
            Shops will appear here as soon as they register.
          </EmptyState>
        )
      ) : (
        <ul aria-label="Shops" className="grid gap-3 sm:grid-cols-2">
          {shops.map((shop) => (
            <li key={shop.id}>
              <ShopCard shop={shop} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
