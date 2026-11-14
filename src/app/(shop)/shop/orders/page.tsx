import { ClipboardList } from "lucide-react";
import type { Metadata } from "next";
import { LiveRefresh } from "@/components/realtime/LiveRefresh";
import { OrderFilterTabs } from "@/components/shop/OrderFilterTabs";
import { ShopOrderCard } from "@/components/shop/ShopOrderCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { shopOrderFilterSchema } from "@/lib/validation/shop-portal";
import { requirePageShop } from "@/server/shops/current";
import { countShopOrders, listShopOrders } from "@/server/shops/orders";

export const metadata: Metadata = { title: "Orders · PEC Market shop" };

const EMPTY: Record<string, { title: string; body: string }> = {
  active: { title: "No active orders", body: "New paid orders appear here." },
  completed: { title: "No completed orders yet", body: "Orders you mark completed, refunded or resolved show up here." },
  disputes: { title: "No disputes", body: "Refund requests and complaints from customers appear here." },
};

export default async function ShopOrdersPage({ searchParams }: { searchParams: Promise<{ filter?: string | string[] }> }) {
  const { shop } = await requirePageShop();
  const raw = (await searchParams).filter;
  const parsed = shopOrderFilterSchema.safeParse({ filter: typeof raw === "string" ? raw : undefined });
  const filter = parsed.success ? parsed.data.filter : "active";
  const [orders, counts] = await Promise.all([listShopOrders(shop.id, filter), countShopOrders(shop.id)]);
  const empty = EMPTY[filter]!;

  return (
    <>
      <LiveRefresh on={["order:status"]} shopId={shop.id} />
      <PageHeader title="Orders" description={filter === "active" ? "Oldest first — work through the queue top to bottom." : undefined} />
      <OrderFilterTabs current={filter} counts={counts} />
      {orders.length === 0 ? (
        <EmptyState icon={ClipboardList} title={empty.title}>
          {empty.body}
        </EmptyState>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {orders.map((order) => (
            <li key={order.id}>
              <ShopOrderCard order={order} shopId={shop.id} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
