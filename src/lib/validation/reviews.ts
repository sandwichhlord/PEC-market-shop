import { z } from "zod";

/** At most this many photos per review (SPEC §3). */
export const MAX_REVIEW_PHOTOS = 3;
export const MAX_REVIEW_COMMENT = 1000;

/** Text fields of the multipart `POST /api/orders/:orderId/review` body (photos are separate `photos` file parts). */
export const REVIEW_FIELDS = ["rating", "comment"] as const;

export const reviewSchema = z.object({
  rating: z.coerce
    .number({ error: "Choose a star rating." })
    .int("Choose a star rating.")
    .min(1, "Choose between 1 and 5 stars.")
    .max(5, "Choose between 1 and 5 stars."),
  comment: z
    .string()
    .trim()
    .max(MAX_REVIEW_COMMENT, `Keep the review under ${MAX_REVIEW_COMMENT} characters.`)
    .default(""),
});
export type ReviewInput = z.infer<typeof reviewSchema>;

/** `?limit=` on the shop reviews list. */
export const reviewListSchema = z.object({ limit: z.coerce.number().int().min(1).max(100).default(50) });
