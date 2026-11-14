import { Skeleton } from "@/components/ui/Skeleton";

export default function ShopMenuLoading() {
  return (
    <div aria-busy="true" aria-label="Loading menu">
      <Skeleton className="mb-2 h-8 w-24" />
      <Skeleton className="mb-5 h-4 w-72 max-w-full" />
      <div className="grid gap-3 lg:grid-cols-2">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex gap-3 rounded-xl border border-slate-200 bg-white p-3">
            <Skeleton className="size-20 shrink-0 rounded-xl" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/3" />
              <Skeleton className="h-6 w-24" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
