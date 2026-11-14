import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { POST as postCheckout } from "@/app/api/checkout/route";
import { prisma } from "@/server/db";
import { ORDER_NUMBER_PATTERN, generateOrderNumber, startCheckout } from "@/server/orders/checkout";
import type { PaymentProvider } from "@/server/payments/types";
import { apiRequest, createDish, createShopOwner, createUser, sessionCookie } from "../helpers/fixtures";

interface ErrorBody {
  error: { code: string; message: string; menuItemIds?: string[]; prices?: { menuItemId: string; pricePaise: number }[] };
}
interface Started {
  orderId: string;
  orderNumber: string;
  totalPaise: number;
  checkoutUrl: string;
}

beforeAll(() => {
  vi.stubEnv("PAYMENTS_PROVIDER", "mock");
});
afterAll(() => {
  vi.unstubAllEnvs();
});

async function setup() {
  const { owner, shop } = await createShopOwner();
  const chai = await createDish(shop.id, { name: "Masala chai", pricePaise: 1500, prepTimeMinutes: 5 });
  const samosa = await createDish(shop.id, { name: "Samosa", pricePaise: 2000, prepTimeMinutes: 8 });
  const customer = await createUser();
  return { owner, shop, chai, samosa, customer, cookie: await sessionCookie(customer) };
}

const checkout = (cookie: string | undefined, json: unknown) => postCheckout(apiRequest("/api/checkout", { cookie, json }));

const orderCount = (customerId: string) => prisma.order.count({ where: { customerId } });

describe("POST /api/checkout", () => {
  it("creates a PENDING_PAYMENT order with price snapshots and starts a mock checkout", async () => {
    const { shop, chai, samosa, customer, cookie } = await setup();
    const res = await checkout(cookie, {
      shopId: shop.id,
      items: [
        { menuItemId: chai.id, quantity: 2, pricePaise: 1500 },
        { menuItemId: samosa.id, quantity: 1, pricePaise: 2000 },
      ],
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as Started;
    expect(body.totalPaise).toBe(5000);
    expect(body.orderNumber).toMatch(ORDER_NUMBER_PATTERN);
    expect(body.checkoutUrl).toBe(`http://localhost:3000/pay/mock/${body.orderId}`);

    const order = await prisma.order.findUniqueOrThrow({
      where: { id: body.orderId },
      include: { items: { orderBy: { nameAtOrder: "asc" } }, events: true },
    });
    expect(order).toMatchObject({
      customerId: customer.id,
      shopId: shop.id,
      status: "PENDING_PAYMENT",
      paymentStatus: "PENDING",
      totalPaise: 5000,
      refundedPaise: 0,
      stripeCheckoutSessionId: `mock_cs_${order.id}`,
      stripePaymentId: null,
    });
    expect(order.items.map((i) => [i.menuItemId, i.nameAtOrder, i.quantity, i.pricePaiseAtOrder, i.refunded])).toEqual([
      [chai.id, "Masala chai", 2, 1500, false],
      [samosa.id, "Samosa", 1, 2000, false],
    ]);
    expect(order.events).toHaveLength(1);
    expect(order.events[0]).toMatchObject({ fromStatus: null, toStatus: "PENDING_PAYMENT", actorId: customer.id });
  });

  it("keeps the snapshot when the dish price changes later", async () => {
    const { shop, chai, cookie } = await setup();
    const res = await checkout(cookie, { shopId: shop.id, items: [{ menuItemId: chai.id, quantity: 1, pricePaise: 1500 }] });
    const { orderId } = (await res.json()) as Started;
    await prisma.menuItem.update({ where: { id: chai.id }, data: { pricePaise: 9900, name: "Renamed chai" } });
    const item = await prisma.orderItem.findFirstOrThrow({ where: { orderId } });
    expect(item).toMatchObject({ pricePaiseAtOrder: 1500, nameAtOrder: "Masala chai" });
  });

  it("does not notify the shop for an unpaid order", async () => {
    const { owner, shop, chai, cookie } = await setup();
    await checkout(cookie, { shopId: shop.id, items: [{ menuItemId: chai.id, quantity: 1, pricePaise: 1500 }] });
    expect(await prisma.notification.count({ where: { userId: owner.id } })).toBe(0);
  });

  it("rejects an out-of-stock dish (409 OUT_OF_STOCK) and creates no order", async () => {
    const { shop, chai, samosa, customer, cookie } = await setup();
    await prisma.menuItem.update({ where: { id: samosa.id }, data: { inStock: false } });
    const res = await checkout(cookie, {
      shopId: shop.id,
      items: [
        { menuItemId: chai.id, quantity: 1, pricePaise: 1500 },
        { menuItemId: samosa.id, quantity: 1, pricePaise: 2000 },
      ],
    });
    expect(res.status).toBe(409);
    const body = (await res.json()) as ErrorBody;
    expect(body.error.code).toBe("OUT_OF_STOCK");
    expect(body.error.menuItemIds).toEqual([samosa.id]);
    expect(body.error.message).toContain("Samosa");
    expect(await orderCount(customer.id)).toBe(0);
  });

  it("rejects a closed shop (409 SHOP_CLOSED)", async () => {
    const { shop, chai, customer, cookie } = await setup();
    await prisma.shop.update({ where: { id: shop.id }, data: { isOpen: false } });
    const res = await checkout(cookie, { shopId: shop.id, items: [{ menuItemId: chai.id, quantity: 1, pricePaise: 1500 }] });
    expect(res.status).toBe(409);
    expect(((await res.json()) as ErrorBody).error.code).toBe("SHOP_CLOSED");
    expect(await orderCount(customer.id)).toBe(0);
  });

  it("rejects a tampered (lower) price with 409 PRICE_CHANGED and the real prices", async () => {
    const { shop, chai, samosa, customer, cookie } = await setup();
    const res = await checkout(cookie, {
      shopId: shop.id,
      items: [
        { menuItemId: chai.id, quantity: 3, pricePaise: 1 },
        { menuItemId: samosa.id, quantity: 1, pricePaise: 2000 },
      ],
    });
    expect(res.status).toBe(409);
    const body = (await res.json()) as ErrorBody;
    expect(body.error.code).toBe("PRICE_CHANGED");
    expect(body.error.prices).toEqual([{ menuItemId: chai.id, name: "Masala chai", pricePaise: 1500 }]);
    expect(await orderCount(customer.id)).toBe(0);
  });

  it("rejects a stale price after the shop changed it", async () => {
    const { shop, chai, cookie } = await setup();
    await prisma.menuItem.update({ where: { id: chai.id }, data: { pricePaise: 1800 } });
    const res = await checkout(cookie, { shopId: shop.id, items: [{ menuItemId: chai.id, quantity: 1, pricePaise: 1500 }] });
    expect(res.status).toBe(409);
    expect(((await res.json()) as ErrorBody).error.code).toBe("PRICE_CHANGED");
  });

  it("rejects archived dishes and dishes from another shop (409 ITEM_UNAVAILABLE)", async () => {
    const { shop, chai, samosa, customer, cookie } = await setup();
    const other = await createShopOwner();
    const foreign = await createDish(other.shop.id, { pricePaise: 1000 });
    await prisma.menuItem.update({ where: { id: samosa.id }, data: { isArchived: true } });

    for (const item of [
      { menuItemId: samosa.id, quantity: 1, pricePaise: 2000 },
      { menuItemId: foreign.id, quantity: 1, pricePaise: 1000 },
      { menuItemId: "does-not-exist", quantity: 1, pricePaise: 1000 },
    ]) {
      const res = await checkout(cookie, { shopId: shop.id, items: [{ menuItemId: chai.id, quantity: 1, pricePaise: 1500 }, item] });
      expect(res.status).toBe(409);
      const body = (await res.json()) as ErrorBody;
      expect(body.error.code).toBe("ITEM_UNAVAILABLE");
      expect(body.error.menuItemIds).toEqual([item.menuItemId]);
    }
    expect(await orderCount(customer.id)).toBe(0);
  });

  it("404s an unknown shop and a shop whose owner is suspended", async () => {
    const { shop, chai, owner, cookie } = await setup();
    const unknown = await checkout(cookie, { shopId: "nope", items: [{ menuItemId: chai.id, quantity: 1, pricePaise: 1500 }] });
    expect(unknown.status).toBe(404);
    await prisma.user.update({ where: { id: owner.id }, data: { status: "SUSPENDED" } });
    const hidden = await checkout(cookie, { shopId: shop.id, items: [{ menuItemId: chai.id, quantity: 1, pricePaise: 1500 }] });
    expect(hidden.status).toBe(404);
    expect(((await hidden.json()) as ErrorBody).error.code).toBe("SHOP_NOT_FOUND");
  });

  it.each([
    ["an empty cart", { items: [] }],
    ["quantity 0", { items: [{ quantity: 0 }] }],
    ["quantity above the cap", { items: [{ quantity: 21 }] }],
    ["a fractional quantity", { items: [{ quantity: 1.5 }] }],
    ["a negative price", { items: [{ pricePaise: -1 }] }],
    ["a fractional price", { items: [{ pricePaise: 1500.5 }] }],
    ["a duplicated dish", { duplicate: true }],
    ["a missing shopId", { noShop: true }],
  ])("400s %s", async (_label, variant: { items?: Partial<{ quantity: number; pricePaise: number }>[]; duplicate?: boolean; noShop?: boolean }) => {
    const { shop, chai, customer, cookie } = await setup();
    const base = { menuItemId: chai.id, quantity: 1, pricePaise: 1500 };
    const items = variant.duplicate ? [base, base] : (variant.items ?? [{}]).map((o) => ({ ...base, ...o }));
    const res = await checkout(cookie, variant.noShop ? { items } : { shopId: shop.id, items });
    expect(res.status).toBe(400);
    expect(((await res.json()) as ErrorBody).error.code).toBe("VALIDATION_ERROR");
    expect(await orderCount(customer.id)).toBe(0);
  });

  it("400s malformed JSON", async () => {
    const { cookie } = await setup();
    const req = new Request("http://localhost:3000/api/checkout", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: "{not json",
    });
    expect((await postCheckout(req)).status).toBe(400);
  });

  it("requires a signed-in, non-suspended customer", async () => {
    const { shop, chai, owner } = await setup();
    const json = { shopId: shop.id, items: [{ menuItemId: chai.id, quantity: 1, pricePaise: 1500 }] };
    expect((await checkout(undefined, json)).status).toBe(401);
    expect((await checkout(await sessionCookie(owner), json)).status).toBe(403);
    const admin = await createUser({ role: "ADMIN" });
    expect((await checkout(await sessionCookie(admin), json)).status).toBe(403);
    const suspended = await createUser({ status: "SUSPENDED" });
    const res = await checkout(await sessionCookie(suspended), json);
    expect(res.status).toBe(403);
    expect(((await res.json()) as ErrorBody).error.code).toBe("ACCOUNT_SUSPENDED");
    expect(await prisma.order.count({ where: { shopId: shop.id } })).toBe(0);
  });

  it("answers 503 when payments are misconfigured", async () => {
    const { shop, chai, cookie } = await setup();
    vi.stubEnv("PAYMENTS_PROVIDER", "stripe");
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    try {
      const res = await checkout(cookie, { shopId: shop.id, items: [{ menuItemId: chai.id, quantity: 1, pricePaise: 1500 }] });
      expect(res.status).toBe(503);
      expect(((await res.json()) as ErrorBody).error.code).toBe("PAYMENTS_UNAVAILABLE");
    } finally {
      vi.stubEnv("PAYMENTS_PROVIDER", "mock");
    }
  });
});

describe("startCheckout", () => {
  it("marks the order PAYMENT_FAILED and throws 502 when the provider cannot start a checkout", async () => {
    const { shop, chai, customer } = await setup();
    const broken: PaymentProvider = {
      name: "stripe",
      createCheckout: vi.fn(async () => {
        throw new Error("Stripe is down");
      }),
      retrieveCheckout: vi.fn(),
      cancelCheckout: vi.fn(),
      refund: vi.fn(),
    };
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      startCheckout(customer, { shopId: shop.id, items: [{ menuItemId: chai.id, quantity: 1, pricePaise: 1500 }] }, broken),
    ).rejects.toMatchObject({ status: 502, code: "PAYMENT_PROVIDER_ERROR" });
    spy.mockRestore();
    const order = await prisma.order.findFirstOrThrow({ where: { customerId: customer.id } });
    expect(order).toMatchObject({ status: "PAYMENT_FAILED", paymentStatus: "FAILED" });
  });

  it("passes the order's lines, currency and customer email to the provider", async () => {
    const { shop, chai, samosa, customer } = await setup();
    const createCheckout = vi.fn(async () => ({ url: "https://pay.example/cs_1", sessionId: `cs_test_${customer.id}` }));
    const provider: PaymentProvider = { name: "stripe", createCheckout, retrieveCheckout: vi.fn(), cancelCheckout: vi.fn(), refund: vi.fn() };
    const started = await startCheckout(
      customer,
      {
        shopId: shop.id,
        items: [
          { menuItemId: samosa.id, quantity: 2, pricePaise: 2000 },
          { menuItemId: chai.id, quantity: 1, pricePaise: 1500 },
        ],
      },
      provider,
    );
    expect(started.checkoutUrl).toBe("https://pay.example/cs_1");
    expect(createCheckout).toHaveBeenCalledWith({
      id: started.orderId,
      orderNumber: started.orderNumber,
      shopName: shop.name,
      customerEmail: customer.email,
      currency: "inr",
      items: [
        { name: "Samosa", unitAmountPaise: 2000, quantity: 2 },
        { name: "Masala chai", unitAmountPaise: 1500, quantity: 1 },
      ],
    });
    const order = await prisma.order.findUniqueOrThrow({ where: { id: started.orderId } });
    expect(order.stripeCheckoutSessionId).toBe(`cs_test_${customer.id}`);
    expect(order.totalPaise).toBe(5500);
  });
});

describe("generateOrderNumber", () => {
  it("produces short, readable, unambiguous ids", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) {
      const n = generateOrderNumber();
      expect(n).toMatch(ORDER_NUMBER_PATTERN);
      expect(n.slice(3)).not.toMatch(/[01IO]/);
      seen.add(n);
    }
    expect(seen.size).toBeGreaterThan(495);
  });
});
