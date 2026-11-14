"use client";

import { ImagePlus, Star, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { TextArea } from "@/components/ui/TextField";
import { apiFetch, fieldError, type ApiError } from "@/lib/api-client";
import { MAX_REVIEW_COMMENT, MAX_REVIEW_PHOTOS } from "@/lib/validation/reviews";

const STAR_LABEL = ["", "Poor", "Fair", "Good", "Very good", "Excellent"] as const;
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

interface Photo {
  file: File;
  preview: string;
}

/** Review form for a completed order: 1–5 stars (required), optional comment, up to 3 photos (SPEC §3). */
export function ReviewForm({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // Release object URLs when photos are removed or the form unmounts.
  const previews = useRef<string[]>([]);
  useEffect(() => {
    previews.current = photos.map((p) => p.preview);
  }, [photos]);
  useEffect(() => () => previews.current.forEach((url) => URL.revokeObjectURL(url)), []);

  function addPhotos(list: FileList | null) {
    setPhotoError(null);
    if (!list) return;
    const room = MAX_REVIEW_PHOTOS - photos.length;
    const chosen = Array.from(list);
    const tooBig = chosen.filter((f) => f.size > MAX_PHOTO_BYTES);
    const ok = chosen.filter((f) => f.size <= MAX_PHOTO_BYTES);
    if (tooBig.length > 0) setPhotoError("Photos must be 5 MB or smaller each.");
    if (ok.length > room) setPhotoError(`You can add up to ${MAX_REVIEW_PHOTOS} photos.`);
    setPhotos((current) => [...current, ...ok.slice(0, room).map((file) => ({ file, preview: URL.createObjectURL(file) }))]);
    if (fileInput.current) fileInput.current.value = "";
  }

  function removePhoto(index: number) {
    setPhotos((current) => {
      const removed = current[index];
      if (removed) URL.revokeObjectURL(removed.preview);
      return current.filter((_, i) => i !== index);
    });
    setPhotoError(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (rating === 0) {
      setError({ status: 400, code: "VALIDATION_ERROR", message: "Choose a star rating.", fieldErrors: { rating: ["Choose a star rating."] } });
      return;
    }
    const body = new FormData();
    body.set("rating", String(rating));
    body.set("comment", comment);
    for (const p of photos) body.append("photos", p.file);
    setPending(true);
    setError(null);
    const result = await apiFetch(`/api/orders/${orderId}/review`, { method: "POST", body });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  const shown = hover || rating;
  const ratingError = fieldError(error, "rating");
  const serverPhotoError = error?.field === "photos" ? error.message : undefined;

  return (
    <form onSubmit={submit} className="space-y-4" noValidate aria-label="Review this order">
      <fieldset>
        <legend className="mb-1 text-sm font-medium text-slate-700">Your rating</legend>
        <div className="flex items-center gap-2">
          <div className="flex" onMouseLeave={() => setHover(0)}>
            {[1, 2, 3, 4, 5].map((n) => (
              <label
                key={n}
                className="cursor-pointer rounded-md p-1 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-orange-600"
                onMouseEnter={() => setHover(n)}
              >
                <input
                  type="radio"
                  name="rating"
                  value={n}
                  checked={rating === n}
                  onChange={() => setRating(n)}
                  className="sr-only"
                  aria-label={`${n} star${n === 1 ? "" : "s"} – ${STAR_LABEL[n]}`}
                />
                <Star
                  aria-hidden="true"
                  className={`size-8 transition-colors ${n <= shown ? "fill-amber-400 text-amber-400" : "fill-transparent text-slate-300"}`}
                />
              </label>
            ))}
          </div>
          <span className="text-sm text-slate-600" aria-live="polite">
            {shown > 0 ? STAR_LABEL[shown] : ""}
          </span>
        </div>
        {ratingError && <p className="mt-1 text-sm text-red-600">{ratingError}</p>}
      </fieldset>

      <TextArea
        label="Comments (optional)"
        rows={3}
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        maxLength={MAX_REVIEW_COMMENT}
        placeholder="What did you like? What could be better?"
        hint={`${comment.length}/${MAX_REVIEW_COMMENT}`}
        error={fieldError(error, "comment")}
      />

      <div className="space-y-2">
        <p className="text-sm font-medium text-slate-700">Photos (optional, up to {MAX_REVIEW_PHOTOS})</p>
        <ul className="flex flex-wrap gap-2">
          {photos.map((p, i) => (
            <li key={p.preview} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element -- local object-URL preview, nothing to optimise */}
              <img src={p.preview} alt={`Photo ${i + 1} preview`} className="size-20 rounded-lg border border-slate-200 object-cover" />
              <button
                type="button"
                onClick={() => removePhoto(i)}
                className="absolute -top-2 -right-2 grid size-7 place-items-center rounded-full bg-slate-800 text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600"
                aria-label={`Remove photo ${i + 1}`}
              >
                <X aria-hidden="true" className="size-4" />
              </button>
            </li>
          ))}
          {photos.length < MAX_REVIEW_PHOTOS && (
            <li>
              <label className="grid size-20 cursor-pointer place-items-center rounded-lg border border-dashed border-slate-300 text-slate-500 hover:bg-slate-50 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-orange-600">
                <ImagePlus aria-hidden="true" className="size-6" />
                <span className="sr-only">Add photos</span>
                <input
                  ref={fileInput}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  multiple
                  className="sr-only"
                  onChange={(e) => addPhotos(e.target.files)}
                  data-testid="review-photos"
                />
              </label>
            </li>
          )}
        </ul>
        {(photoError ?? serverPhotoError) && <p className="text-sm text-red-600">{photoError ?? serverPhotoError}</p>}
      </div>

      {error && !error.fieldErrors && error.field !== "photos" && <Alert tone="error">{error.message}</Alert>}
      <Button type="submit" loading={pending} className="w-full sm:w-auto">
        Post review
      </Button>
    </form>
  );
}
