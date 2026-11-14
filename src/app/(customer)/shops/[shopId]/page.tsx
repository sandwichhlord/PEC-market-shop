import { ArrowLeft, MapPin, MessageSquare } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LiveRefresh } from "@/components/realtime/LiveRefresh";
import { ReviewCard } from "@/components/reviews/ReviewCard";
import { ShopMenu } from "@/components/shops/ShopMenu";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { Pill } from "@/components/ui/Pill";
import { Rating } from "@/components/ui/Rating";
import { Stars } from "@/components/ui/Stars";
import { Thumb } from "@/components/ui/Thumb";
import { shopIdSchema } from "@/lib/validation/shops";
import { listShopReviews } from "@/server/reviews/reviews";
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
  const reviews = await listShopReviews(shop.id);

  return (
    <>
      <LiveRefresh on={["menu:item", "shop:updated", "shop:review"]} shopId={shop.id} subscribe={{ kind: "menu", id: shop.id }} />
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

      <section aria-labelledby="reviews-heading" className="mt-8">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="reviews-heading" className="text-lg font-semibold text-slate-900">
            Reviews
          </h2>
          {shop.rating.average !== null && (
            <p className="flex items-center gap-2 text-sm text-slate-700" data-testid="shop-average">
              <Stars rating={Math.round(shop.rating.average)} />
              <span>
                <span className="font-semibold">{shop.rating.average.toFixed(1)}</span> out of 5 · {shop.rating.count}{" "}
                review{shop.rating.count === 1 ? "" : "s"}
              </span>
            </p>
          )}
        </div>
        {reviews.length === 0 ? (
          <EmptyState icon={MessageSquare} title="No reviews yet">
            Reviews appear here after customers collect their orders.
          </EmptyState>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
            {reviews.map((r) => (
              <li key={r.id} className="p-4">
                <ReviewCard review={{ ...r, authorName: r.customer.name }} />
              </li>
            ))}
          </ul>
        )}
        {shop.rating.count > reviews.length && (
          <p className="mt-2 text-xs text-slate-500">Showing the {reviews.length} most recent reviews.</p>
        )}
      </section>
    </>
  );
}
