import { Stars } from "@/components/ui/Stars";
import { formatDate } from "@/lib/datetime";

export interface ReviewView {
  id: string;
  rating: number;
  comment: string;
  photos: string[];
  createdAt: Date;
  /** Reviewer's name; omitted for the customer's own review on their order page. */
  authorName?: string;
}

/** One review: stars, author and date, comment and photo thumbnails (each opens full size in a new tab). */
export function ReviewCard({ review }: { review: ReviewView }) {
  return (
    <article className="space-y-2" data-testid="review">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Stars rating={review.rating} />
        {review.authorName && <span className="text-sm font-medium text-slate-800">{review.authorName}</span>}
        <time dateTime={review.createdAt.toISOString()} className="text-xs text-slate-500">
          {formatDate(review.createdAt)}
        </time>
      </div>
      {review.comment && <p className="text-sm break-words whitespace-pre-line text-slate-700">{review.comment}</p>}
      {review.photos.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {review.photos.map((url, i) => (
            <li key={url}>
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- user uploads served by our own API route */}
                <img
                  src={url}
                  alt={`Review photo ${i + 1}`}
                  loading="lazy"
                  className="size-20 rounded-lg border border-slate-200 object-cover"
                />
              </a>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
