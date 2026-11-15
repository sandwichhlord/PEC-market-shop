import { NextResponse } from "next/server";
import { orderIdSchema } from "@/lib/validation/checkout";
import { MAX_REVIEW_PHOTOS, REVIEW_FIELDS, reviewSchema } from "@/lib/validation/reviews";
import { requireOrderAccess } from "@/server/auth/guards";
import { FORM_OVERHEAD_BYTES, HttpError, forbidden, formStrings, readForm, withErrors } from "@/server/http";
import { createReview } from "@/server/reviews/reviews";
import { validateImageFile } from "@/server/storage/image";
import { MAX_UPLOAD_BYTES } from "@/server/storage/types";

/**
 * POST multipart { rating: 1–5, comment?, photos?: up to 3 image files } → 201 { review, rating }.
 * The order's customer only, once the order is COMPLETED, one review per order.
 */
export const POST = withErrors(async (req: Request, ctx: { params: Promise<{ orderId: string }> }) => {
  const { orderId } = orderIdSchema.parse(await ctx.params);
  const { user, access } = await requireOrderAccess(req, orderId);
  if (access !== "customer") throw forbidden("Only the customer who placed the order can review it.");

  // Oversized bodies are refused while streaming in (3 photos plus the multipart allowance).
  const form = await readForm(req, {
    maxBytes: MAX_REVIEW_PHOTOS * MAX_UPLOAD_BYTES + FORM_OVERHEAD_BYTES,
    field: "photos",
    message: "Photos must be 5 MB or smaller each.",
  });
  const input = reviewSchema.parse(formStrings(form, REVIEW_FIELDS));

  const parts = form.getAll("photos");
  if (parts.some((p) => typeof p === "string" && p !== "")) {
    throw new HttpError(400, "INVALID_IMAGE", "Expected image files.", { field: "photos" });
  }
  // Browsers send one empty part when no file was chosen.
  const files = parts.filter((p): p is File => p instanceof File && (p.size > 0 || p.name !== ""));
  if (files.length > MAX_REVIEW_PHOTOS) {
    throw new HttpError(400, "TOO_MANY_PHOTOS", `Add at most ${MAX_REVIEW_PHOTOS} photos.`, { field: "photos" });
  }
  const photos = [];
  for (const file of files) photos.push(await validateImageFile(file, "photos"));

  return NextResponse.json(await createReview(orderId, user.id, input, photos), { status: 201 });
});
