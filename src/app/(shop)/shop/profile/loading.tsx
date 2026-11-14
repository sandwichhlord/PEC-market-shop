import { Skeleton } from "@/components/ui/Skeleton";

export default function ShopProfileLoading() {
  return (
    <div aria-busy="true" aria-label="Loading shop profile" className="max-w-xl space-y-4">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-16 w-full" />
      {Array.from({ length: 4 }, (_, i) => (
        <Skeleton key={i} className="h-11 w-full" />
      ))}
    </div>
  );
}
