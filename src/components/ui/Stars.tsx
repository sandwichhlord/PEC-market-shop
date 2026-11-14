import { Star } from "lucide-react";

/** Read-only row of five stars with `rating` of them filled. */
export function Stars({ rating, size = "sm" }: { rating: number; size?: "sm" | "md" }) {
  const cls = size === "md" ? "size-5" : "size-4";
  return (
    <span className="inline-flex items-center gap-0.5" role="img" aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          aria-hidden="true"
          className={`${cls} ${n <= rating ? "fill-amber-400 text-amber-400" : "fill-transparent text-slate-300"}`}
        />
      ))}
    </span>
  );
}
