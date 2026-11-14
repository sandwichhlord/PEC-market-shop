import { Skeleton } from "@/components/ui/Skeleton";

export default function ShopsLoading() {
  return (
    <div aria-busy="true" aria-label="Loading shops">
      <Skeleton className="mb-2 h-8 w-32" />
      <Skeleton className="mb-5 h-4 w-64 max-w-full" />
      <Skeleton className="mb-4 h-11 w-full" />
      <div className="grid gap-3 sm:grid-cols-2">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="flex gap-3 rounded-xl border border-slate-200 bg-white p-3">
            <Skeleton className="size-14 shrink-0 rounded-xl" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/2" />
              <Skeleton className="h-3 w-1/4" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
