import { Star } from "lucide-react";

/** Compact average rating, e.g. "★ 4.5 (12)", or "No reviews yet". */
export function Rating({ average, count }: { average: number | null; count: number }) {
  if (average === null || count === 0) return <span className="text-xs text-slate-500">No reviews yet</span>;
  return (
    <span className="inline-flex items-center gap-1 text-sm text-slate-700" aria-label={`Rated ${average.toFixed(1)} out of 5 from ${count} review${count === 1 ? "" : "s"}`}>
      <Star aria-hidden="true" className="size-3.5 fill-amber-400 text-amber-400" />
      <span className="font-semibold">{average.toFixed(1)}</span>
      <span className="text-slate-500">({count})</span>
    </span>
  );
}
