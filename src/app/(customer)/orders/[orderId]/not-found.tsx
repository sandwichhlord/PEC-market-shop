import { ClipboardList } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/ui/EmptyState";

export default function OrderNotFound() {
  return (
    <EmptyState icon={ClipboardList} title="Order not found">
      It may belong to a different account.{" "}
      <Link href="/orders" className="font-medium text-orange-700 underline-offset-2 hover:underline">
        See your orders
      </Link>
    </EmptyState>
  );
}
