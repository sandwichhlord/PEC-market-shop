import { ArrowLeft, MapPin } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ShopMenu } from "@/components/shops/ShopMenu";
import { Alert } from "@/components/ui/Alert";
import { Pill } from "@/components/ui/Pill";
import { Rating } from "@/components/ui/Rating";
import { Thumb } from "@/components/ui/Thumb";
import { shopIdSchema } from "@/lib/validation/shops";
import { getShopMenu } from "@/server/shops/list";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ shopId: string }> };

async function loadShop(params: Props["params"]) {
  const parsed = shopIdSchema.safeParse(await params);
  return parsed.success ? getShopMenu(parsed.data.shopId) : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const shop = await loadShop(params);
  return { title: `${shop?.name ?? "Shop"} · PEC Market` };
}

export default async function ShopPage({ params }: Props) {
  const shop = await loadShop(params);
  if (!shop) notFound();

  return (
    <>
      <Link
        href="/shops"
        className="mb-3 inline-flex min-h-10 items-center gap-1 rounded-lg text-sm font-medium text-slate-600 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-orange-600"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        All shops
      </Link>

      <header className="mb-5 flex gap-4 rounded-xl border border-slate-200 bg-white p-4">
        <Thumb src={shop.logoUrl} alt={`${shop.name} logo`} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">{shop.name}</h1>
            <Pill tone={shop.isOpen ? "green" : "grey"}>{shop.isOpen ? "Open" : "Closed"}</Pill>
          </div>
          <p className="mt-1 flex items-center gap-1 text-sm text-slate-500">
            <MapPin aria-hidden="true" className="size-3.5 shrink-0" />
            <span className="min-w-0 break-words">{shop.location}</span>
          </p>
          <div className="mt-1">
            <Rating average={shop.rating.average} count={shop.rating.count} />
          </div>
          {shop.description && <p className="mt-2 text-sm text-slate-700">{shop.description}</p>}
        </div>
      </header>

      {!shop.isOpen && (
        <div className="mb-4">
          <Alert tone="warning">This shop is closed right now. You can look at the menu, but ordering is paused.</Alert>
        </div>
      )}

      <h2 className="mb-3 text-lg font-semibold text-slate-900">Menu</h2>
      <ShopMenu shop={{ id: shop.id, name: shop.name, isOpen: shop.isOpen }} dishes={shop.menuItems} />
    </>
  );
}
