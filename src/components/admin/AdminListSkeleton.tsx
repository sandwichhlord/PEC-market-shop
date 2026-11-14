import { Skeleton } from "@/components/ui/Skeleton";

/** Placeholder for an admin list page while it loads. */
export function AdminListSkeleton({ label }: { label: string }) {
  return (
    <div aria-busy="true" aria-label={label}>
      <Skeleton className="mb-2 h-8 w-40" />
      <Skeleton className="mb-5 h-4 w-2/3" />
      <Skeleton className="mb-4 h-12 w-full" />
      <div className="space-y-3">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex justify-between">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-3 w-3/4" />
          </div>
        ))}
      </div>
    </div>
  );
}
