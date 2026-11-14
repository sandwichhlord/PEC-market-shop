import { Scale } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/ui/EmptyState";

export default function AdminDisputeNotFound() {
  return (
    <EmptyState icon={Scale} title="Dispute not found">
      <Link href="/admin/disputes" className="font-medium text-orange-700 hover:underline">
        Back to all disputes
      </Link>
    </EmptyState>
  );
}
