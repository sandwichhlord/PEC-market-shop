import { ClipboardList } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { CustomerOrderCard } from "@/components/orders/CustomerOrderCard";
import { CustomerOrderTabs } from "@/components/orders/CustomerOrderTabs";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { customerOrderTabSchema } from "@/lib/validation/orders";
import { requirePageUser } from "@/server/auth/current";
import { countCustomerOrders, listCustomerOrders } from "@/server/orders/history";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Orders · PEC Market" };

const EMPTY = {
  active: { title: "No active orders", body: "Orders you place show up here until they are picked up." },
  past: { title: "No past orders yet", body: "Completed, refunded and failed orders are kept here." },
} as const;

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ tab?: string | string[] }> }) {
  const user = await requirePageUser("CUSTOMER");
  const raw = (await searchParams).tab;
  const parsed = customerOrderTabSchema.safeParse({ tab: typeof raw === "string" ? raw : undefined });
  const tab = parsed.success ? parsed.data.tab : "active";
  const [orders, counts] = await Promise.all([listCustomerOrders(user.id, tab), countCustomerOrders(user.id)]);

  return (
    <>
      <PageHeader title="Your orders" />
      <CustomerOrderTabs current={tab} counts={counts} />
      {orders.length === 0 ? (
        <EmptyState icon={ClipboardList} title={EMPTY[tab].title}>
          {EMPTY[tab].body}{" "}
          {tab === "active" && (
            <Link href="/shops" className="font-medium text-orange-700 underline-offset-2 hover:underline">
              Browse shops
            </Link>
          )}
        </EmptyState>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {orders.map((order) => (
            <li key={order.id}>
              <CustomerOrderCard order={order} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
