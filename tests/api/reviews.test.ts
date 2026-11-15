import { afterEach, describe, expect, it, vi } from "vitest";
import type { Server } from "socket.io";
import type { OrderStatus } from "@/generated/prisma/enums";
import { GET as getShop } from "@/app/api/shops/[shopId]/route";
import { GET as getReviews } from "@/app/api/shops/[shopId]/reviews/route";
import { POST as postReview } from "@/app/api/orders/[orderId]/review/route";
import { prisma } from "@/server/db";
import { getStorage } from "@/server/storage";
import { JPEG_BYTES, PNG_BYTES, apiRequest, createOrderWith, createShopOwner, createUser, imageFile, sessionCookie } from "../helpers/fixtures";

interface ReviewBody {
  review: { id: string; orderId: string; rating: number; comment: string; photos: string[]; customer: { name: string } };
  rating: { average: number | null; count: number };
  error?: { code: string; message: string; field?: string };
}

afterEach(() => {
  globalThis.io = undefined;
  vi.restoreAllMocks();
});

/** Captures what would be broadcast: a stand-in Socket.IO server recording (rooms, event name, payload). */
function captureEmits() {
  const sent: { rooms: string[]; name: string; payload: unknown }[] = [];
  const fake = { to: (rooms: string[]) => ({ emit: (name: string, payload: unknown) => sent.push({ rooms, name, payload }) }) };
  globalThis.io = fake as unknown as Server;
  return sent;
}

function reviewForm(fields: { rating?: string | number; comment?: string; photos?: (File | string)[] }) {
  const form = new FormData();
  if (fields.rating !== undefined) form.set("rating", String(fields.rating));
  if (fields.comment !== undefined) form.set("comment", fields.comment);
  for (const p of fields.photos ?? []) form.append("photos", p);
  return form;
}

async function review(orderId: string, cookie: string | undefined, fields: Parameters<typeof reviewForm>[0]) {
  const res = await postReview(apiRequest(`/api/orders/${orderId}/review`, { cookie, form: reviewForm(fields) }), {
    params: Promise.resolve({ orderId }),
  });
  return { status: res.status, body: (await res.json()) as ReviewBody };
}

async function setup(status: OrderStatus = "COMPLETED") {
  const { owner, shop } = await createShopOwner();
  const customer = await createUser();
  const order = await createOrderWith({ customerId: customer.id, shopId: shop.id, status });
  return { owner, shop, customer, order, cookie: await sessionCookie(customer) };
}

async function shopRatingVia(shopId: string, cookie: string) {
  const res = await getShop(apiRequest(`/api/shops/${shopId}`, { cookie }), { params: Promise.resolve({ shopId }) });
  return ((await res.json()) as { shop: { rating: { average: number | null; count: number } } }).shop.rating;
}

describe("POST /api/orders/:orderId/review", () => {
  it("creates a review with stars, comment and photos on a COMPLETED order", async () => {
    const { shop, order, customer, cookie } = await setup();
    const sent = captureEmits();
    const { status, body } = await review(order.id, cookie, {
      rating: 4,
      comment: "  Crispy dosa, quick service.  ",
      photos: [imageFile(PNG_BYTES, "a.png"), imageFile(JPEG_BYTES, "b.jpg", "image/jpeg")],
    });
    expect(status).toBe(201);
    expect(body.review).toMatchObject({ orderId: order.id, rating: 4, comment: "Crispy dosa, quick service.", customer: { name: customer.name } });
    expect(body.review.photos).toHaveLength(2);
    expect(body.review.photos[0]).toMatch(/^\/api\/uploads\/reviews\/.+\.png$/);
    expect(body.review.photos[1]).toMatch(/^\/api\/uploads\/reviews\/.+\.jpg$/);
    expect(await getStorage().read(body.review.photos[1]!.replace("/api/uploads/", ""))).not.toBeNull();
    expect(body.rating).toEqual({ average: 4, count: 1 });

    const row = await prisma.review.findUniqueOrThrow({ where: { orderId: order.id } });
    expect(row).toMatchObject({ customerId: customer.id, shopId: shop.id, rating: 4 });
    expect(sent).toEqual([
      {
        rooms: [`menu:${shop.id}`, `shop:${shop.id}`, "shops:all"],
        name: "shop:review",
        payload: { type: "shop:review", shopId: shop.id, orderId: order.id, reviewId: body.review.id, average: 4, count: 1 },
      },
    ]);
  });

  it("accepts stars only (comment and photos are optional)", async () => {
    const { order, cookie } = await setup();
    const { status, body } = await review(order.id, cookie, { rating: 5 });
    expect(status).toBe(201);
    expect(body.review).toMatchObject({ rating: 5, comment: "", photos: [] });
  });

  it.each(["PLACED_PAID", "PREPARING", "READY_FOR_PICKUP", "REFUND_REQUESTED", "REFUNDED", "COMPLAINT_FILED", "RESOLVED"] as const)(
    "is blocked while the order is %s",
    async (orderStatus) => {
      const { order, cookie } = await setup(orderStatus);
      const { status, body } = await review(order.id, cookie, { rating: 5 });
      expect(status).toBe(409);
      expect(body.error?.code).toBe("REVIEW_NOT_AVAILABLE");
      expect(await prisma.review.count({ where: { orderId: order.id } })).toBe(0);
    },
  );

  it("is blocked for unpaid orders", async () => {
    for (const orderStatus of ["PENDING_PAYMENT", "PAYMENT_FAILED"] as const) {
      const { order, cookie } = await setup(orderStatus);
      expect((await review(order.id, cookie, { rating: 3 })).status).toBe(409);
    }
  });

  it("allows only one review per order", async () => {
    const { order, cookie } = await setup();
    expect((await review(order.id, cookie, { rating: 2 })).status).toBe(201);
    const second = await review(order.id, cookie, { rating: 5, comment: "Changed my mind" });
    expect(second.status).toBe(409);
    expect(second.body.error?.code).toBe("ALREADY_REVIEWED");
    const rows = await prisma.review.findMany({ where: { orderId: order.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.rating).toBe(2);
  });

  it("allows only one review when two submissions race", async () => {
    const { order, cookie } = await setup();
    const results = await Promise.all([review(order.id, cookie, { rating: 1 }), review(order.id, cookie, { rating: 5 })]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await prisma.review.count({ where: { orderId: order.id } })).toBe(1);
  });

  it("blocks reviewing another customer's order (404, nothing written)", async () => {
    const { order } = await setup();
    const stranger = await sessionCookie(await createUser());
    const { status } = await review(order.id, stranger, { rating: 1, comment: "Never ate here" });
    expect(status).toBe(404);
    expect(await prisma.review.count({ where: { orderId: order.id } })).toBe(0);
  });

  it("blocks the shop owner and admins from reviewing (403)", async () => {
    const { order, owner } = await setup();
    const admin = await createUser({ role: "ADMIN" });
    expect((await review(order.id, await sessionCookie(owner), { rating: 5 })).status).toBe(403);
    expect((await review(order.id, await sessionCookie(admin), { rating: 5 })).status).toBe(403);
    expect(await prisma.review.count({ where: { orderId: order.id } })).toBe(0);
  });

  it("requires a session and rejects suspended customers", async () => {
    const { order, customer } = await setup();
    expect((await review(order.id, undefined, { rating: 5 })).status).toBe(401);
    await prisma.user.update({ where: { id: customer.id }, data: { status: "SUSPENDED" } });
    expect((await review(order.id, await sessionCookie(customer), { rating: 5 })).status).toBe(403);
  });

  it.each([
    ["missing rating", {}],
    ["rating 0", { rating: 0 }],
    ["rating 6", { rating: 6 }],
    ["fractional rating", { rating: "4.5" }],
    ["non-numeric rating", { rating: "great" }],
    ["comment over 1000 characters", { rating: 4, comment: "x".repeat(1001) }],
  ])("validates input: %s → 400", async (_label, fields) => {
    const { order, cookie } = await setup();
    const { status, body } = await review(order.id, cookie, fields);
    expect(status).toBe(400);
    expect(body.error?.code).toBe("VALIDATION_ERROR");
  });

  it("accepts at most 3 photos, images only", async () => {
    const { order, cookie } = await setup();
    const four = Array.from({ length: 4 }, (_, i) => imageFile(PNG_BYTES, `p${i}.png`));
    const tooMany = await review(order.id, cookie, { rating: 4, photos: four });
    expect(tooMany.status).toBe(400);
    expect(tooMany.body.error?.code).toBe("TOO_MANY_PHOTOS");

    const notImage = await review(order.id, cookie, { rating: 4, photos: [imageFile(new TextEncoder().encode("<svg/>"), "x.png")] });
    expect(notImage.status).toBe(400);
    expect(notImage.body.error?.code).toBe("INVALID_IMAGE");

    const text = await review(order.id, cookie, { rating: 4, photos: ["not a file"] });
    expect(text.status).toBe(400);
    expect(await prisma.review.count({ where: { orderId: order.id } })).toBe(0);

    const three = Array.from({ length: 3 }, (_, i) => imageFile(PNG_BYTES, `p${i}.png`));
    const ok = await review(order.id, cookie, { rating: 4, photos: three });
    expect(ok.status).toBe(201);
    expect(ok.body.review.photos).toHaveLength(3);
  });

  it("ignores the empty file part a browser sends when no photo was chosen", async () => {
    const { order, cookie } = await setup();
    const { status, body } = await review(order.id, cookie, { rating: 3, photos: [new File([], "", { type: "application/octet-stream" })] });
    expect(status).toBe(201);
    expect(body.review.photos).toEqual([]);
  });
});

describe("shop average rating and reviews list", () => {
  it("updates the shop's average as reviews arrive", async () => {
    const { shop } = await createShopOwner();
    const viewer = await sessionCookie(await createUser());
    expect(await shopRatingVia(shop.id, viewer)).toEqual({ average: null, count: 0 });

    const ratings = [5, 4, 4];
    for (const [i, rating] of ratings.entries()) {
      const customer = await createUser();
      const order = await createOrderWith({ customerId: customer.id, shopId: shop.id, status: "COMPLETED" });
      const { status, body } = await review(order.id, await sessionCookie(customer), { rating, comment: `Review ${i}` });
      expect(status).toBe(201);
      const expected = Math.round((ratings.slice(0, i + 1).reduce((a, b) => a + b, 0) / (i + 1)) * 10) / 10;
      expect(body.rating).toEqual({ average: expected, count: i + 1 });
      expect(await shopRatingVia(shop.id, viewer)).toEqual({ average: expected, count: i + 1 });
    }
    // 13 / 3 = 4.33… → shown as 4.3
    expect(await shopRatingVia(shop.id, viewer)).toEqual({ average: 4.3, count: 3 });

    const res = await getReviews(apiRequest(`/api/shops/${shop.id}/reviews`, { cookie: viewer }), { params: Promise.resolve({ shopId: shop.id }) });
    expect(res.status).toBe(200);
    const list = (await res.json()) as { rating: { average: number; count: number }; reviews: { rating: number; comment: string; customer: { name: string } }[] };
    expect(list.rating).toEqual({ average: 4.3, count: 3 });
    // Newest first.
    expect(list.reviews.map((r) => r.comment)).toEqual(["Review 2", "Review 1", "Review 0"]);
    expect(list.reviews[0]?.customer.name).toBeTruthy();

    // A review on another shop does not move this shop's average.
    const other = await createShopOwner();
    const customer = await createUser();
    const order = await createOrderWith({ customerId: customer.id, shopId: other.shop.id, status: "COMPLETED" });
    expect((await review(order.id, await sessionCookie(customer), { rating: 1 })).status).toBe(201);
    expect(await shopRatingVia(shop.id, viewer)).toEqual({ average: 4.3, count: 3 });
  });

  it("reviews list needs a session, honours ?limit and 404s hidden shops", async () => {
    const { owner, shop } = await createShopOwner();
    const viewer = await sessionCookie(await createUser());
    const call = (query = "", cookie: string | null = viewer) =>
      getReviews(apiRequest(`/api/shops/${shop.id}/reviews${query}`, { cookie: cookie ?? undefined }), { params: Promise.resolve({ shopId: shop.id }) });

    expect((await call("", null)).status).toBe(401);
    for (const rating of [3, 4]) {
      const customer = await createUser();
      const order = await createOrderWith({ customerId: customer.id, shopId: shop.id, status: "COMPLETED" });
      await review(order.id, await sessionCookie(customer), { rating });
    }
    const limited = (await (await call("?limit=1")).json()) as { reviews: unknown[]; rating: { count: number } };
    expect(limited.reviews).toHaveLength(1);
    expect(limited.rating.count).toBe(2);
    expect((await call("?limit=0")).status).toBe(400);

    await prisma.user.update({ where: { id: owner.id }, data: { status: "SUSPENDED" } });
    expect((await call()).status).toBe(404);
  });
});
