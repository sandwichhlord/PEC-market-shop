import { Skeleton } from "@/components/ui/Skeleton";

export default function ShopOrdersLoading() {
  return (
    <div aria-busy="true" aria-label="Loading orders">
      <Skeleton className="mb-5 h-8 w-32" />
      <Skeleton className="mb-4 h-12 w-full" />
      <div className="grid gap-3 lg:grid-cols-2">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex justify-between">
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-3 w-2/3" />
            <Skeleton className="h-11 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
