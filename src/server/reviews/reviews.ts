// Reviews (SPEC §3): one per COMPLETED order, written by that order's customer — 1–5 stars, optional comment and
// up to 3 photos. Shown on the shop page with the shop's average rating.
import { Prisma } from "@/generated/prisma/client";
import type { ReviewInput } from "@/lib/validation/reviews";
import { prisma } from "@/server/db";
import { HttpError, notFound } from "@/server/http";
import { emit } from "@/server/realtime/emit";
import { shopRating } from "@/server/shops/list";
import { getStorage } from "@/server/storage";
import type { ValidImage } from "@/server/storage/image";
import type { StoredFile } from "@/server/storage/types";

const isUniqueViolation = (err: unknown) => err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";

const alreadyReviewed = () => new HttpError(409, "ALREADY_REVIEWED", "You have already reviewed this order.");

export const REVIEW_SELECT = {
  id: true,
  orderId: true,
  rating: true,
  comment: true,
  photos: true,
  createdAt: true,
  customer: { select: { name: true } },
} as const;

/**
 * Creates the review for one of the customer's own orders. Refused unless the order is COMPLETED (409
 * REVIEW_NOT_AVAILABLE) or when it already has a review (409 ALREADY_REVIEWED, also when two submissions race).
 * Photos are stored only after the checks pass and are removed again if the insert fails.
 */
export async function createReview(orderId: string, customerId: string, input: ReviewInput, photos: readonly ValidImage[]) {
  const order = await prisma.order.findFirst({
    where: { id: orderId, customerId },
    select: { id: true, shopId: true, status: true, review: { select: { id: true } } },
  });
  if (!order) throw notFound("Order not found.");
  if (order.review) throw alreadyReviewed();
  if (order.status !== "COMPLETED") {
    throw new HttpError(409, "REVIEW_NOT_AVAILABLE", "You can review an order once it has been completed.");
  }

  const storage = getStorage();
  const stored: StoredFile[] = [];
  try {
    for (const photo of photos) stored.push(await storage.save({ folder: "reviews", data: photo.data, contentType: photo.contentType }));
    const review = await prisma.review.create({
      data: {
        orderId,
        customerId,
        shopId: order.shopId,
        rating: input.rating,
        comment: input.comment,
        photos: stored.map((s) => s.url),
      },
      select: REVIEW_SELECT,
    });
    const rating = await shopRating(order.shopId);
    emit({ type: "shop:review", shopId: order.shopId, orderId, reviewId: review.id, average: rating.average, count: rating.count });
    return { review, rating };
  } catch (err) {
    await Promise.all(stored.map((s) => storage.delete(s.key).catch(() => undefined)));
    if (isUniqueViolation(err)) throw alreadyReviewed();
    throw err;
  }
}

/** A shop's reviews, newest first. */
export function listShopReviews(shopId: string, limit = 50) {
  return prisma.review.findMany({
    where: { shopId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit,
    select: REVIEW_SELECT,
  });
}

export type ShopReview = Awaited<ReturnType<typeof listShopReviews>>[number];
