import { Store } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/ui/EmptyState";

export default function ShopNotFound() {
  return (
    <EmptyState icon={Store} title="Shop not found">
      It may have closed down.{" "}
      <Link href="/shops" className="font-medium text-orange-700 underline-offset-2 hover:underline">
        Browse all shops
      </Link>
    </EmptyState>
  );
}
