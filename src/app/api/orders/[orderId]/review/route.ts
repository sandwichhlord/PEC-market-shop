import { NextResponse } from "next/server";
import { orderIdSchema } from "@/lib/validation/checkout";
import { MAX_REVIEW_PHOTOS, REVIEW_FIELDS, reviewSchema } from "@/lib/validation/reviews";
import { requireOrderAccess } from "@/server/auth/guards";
import { HttpError, forbidden, formStrings, readForm, withErrors } from "@/server/http";
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

  // Reject oversized bodies before buffering them (3 photos plus a 64 KB multipart allowance).
  const length = Number(req.headers.get("content-length") ?? 0);
  if (length > MAX_REVIEW_PHOTOS * MAX_UPLOAD_BYTES + 64 * 1024) {
    throw new HttpError(413, "IMAGE_TOO_LARGE", "Photos must be 5 MB or smaller each.", { field: "photos" });
  }
  const form = await readForm(req);
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
