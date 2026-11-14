import { Skeleton } from "@/components/ui/Skeleton";

export default function OrderLoading() {
  return (
    <div aria-busy="true" aria-label="Loading order">
      <Skeleton className="mb-3 h-6 w-24" />
      <div className="mb-5 flex items-center gap-3">
        <Skeleton className="size-14 shrink-0" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-64 max-w-full" />
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Skeleton className="h-36 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    </div>
  );
}
