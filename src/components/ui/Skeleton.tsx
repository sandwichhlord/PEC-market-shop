/** Grey shimmer block for loading states. Purely decorative; wrap a group of them in an element with aria-busy. */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-lg bg-slate-200 motion-reduce:animate-none ${className}`} />;
}
