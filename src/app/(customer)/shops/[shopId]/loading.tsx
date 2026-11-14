import { Skeleton } from "@/components/ui/Skeleton";

export default function ShopLoading() {
  return (
    <div aria-busy="true" aria-label="Loading menu">
      <Skeleton className="mb-3 h-6 w-24" />
      <div className="mb-5 flex gap-4 rounded-xl border border-slate-200 bg-white p-4">
        <Skeleton className="size-20 shrink-0 rounded-xl" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-6 w-1/2" />
          <Skeleton className="h-3 w-1/3" />
          <Skeleton className="h-3 w-3/4" />
        </div>
      </div>
      <Skeleton className="mb-3 h-5 w-20" />
      <div className="grid gap-3 lg:grid-cols-2">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex gap-3 rounded-xl border border-slate-200 bg-white p-3">
            <Skeleton className="size-20 shrink-0 rounded-xl" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
