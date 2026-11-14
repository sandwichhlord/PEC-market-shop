import { SearchX } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/ui/EmptyState";

export default function ShopOrderNotFound() {
  return (
    <EmptyState icon={SearchX} title="Order not found">
      <Link href="/shop/orders" className="font-semibold text-orange-700 hover:underline">
        Back to orders
      </Link>
    </EmptyState>
  );
}
