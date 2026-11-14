import { Skeleton } from "@/components/ui/Skeleton";

export default function ShopOrderLoading() {
  return (
    <div aria-busy="true" aria-label="Loading order" className="space-y-4">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-8 w-48" />
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-64 lg:col-span-2" />
        <Skeleton className="h-64" />
      </div>
    </div>
  );
}
