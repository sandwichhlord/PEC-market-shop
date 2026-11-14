// Fixtures for API-level integration tests. Every helper creates uniquely named rows so test files can run in
// parallel against the same database without interfering.
import { randomBytes } from "node:crypto";
import type { AccountStatus, OrderStatus, PaymentStatus, Role } from "@/generated/prisma/enums";
import { signSession } from "@/server/auth/jwt";
import { hashPassword } from "@/server/auth/password";
import { prisma } from "@/server/db";

export const TEST_PASSWORD = "correct-horse-1";
let passwordHash: Promise<string> | undefined;

export const uid = () => randomBytes(5).toString("hex");
export const uniqueEmail = (prefix = "user") => `${prefix}-${uid()}@test.pec`;

export async function createUser(opts: { role?: Role; status?: AccountStatus; warningMessage?: string } = {}) {
  passwordHash ??= hashPassword(TEST_PASSWORD);
  const role = opts.role ?? "CUSTOMER";
  return prisma.user.create({
    data: {
      role,
      name: `Test ${role.toLowerCase()}`,
      email: uniqueEmail(role.toLowerCase()),
      passwordHash: await passwordHash,
      status: opts.status ?? "ACTIVE",
      warningMessage: opts.warningMessage ?? null,
    },
  });
}

export async function createShopOwner() {
  const owner = await createUser({ role: "SHOP_OWNER" });
  const shop = await prisma.shop.create({ data: { ownerId: owner.id, name: `Shop ${uid()}`, location: "Stall 1" } });
  return { owner, shop };
}

export async function createOrder(customerId: string, shopId: string) {
  return prisma.order.create({
    data: { orderNumber: `T${uid()}`, customerId, shopId, totalPaise: 5000, status: "PLACED_PAID", paymentStatus: "PAID" },
  });
}

export async function createDish(shopId: string, data: { name?: string; pricePaise?: number; prepTimeMinutes?: number } = {}) {
  return prisma.menuItem.create({
    data: {
      shopId,
      name: data.name ?? `Dish ${uid()}`,
      pricePaise: data.pricePaise ?? 2500,
      prepTimeMinutes: data.prepTimeMinutes ?? 5,
    },
  });
}

/** The payment status that naturally goes with an order status (for fixtures only). */
export function paymentStatusFor(status: OrderStatus): PaymentStatus {
  if (status === "PENDING_PAYMENT") return "PENDING";
  if (status === "PAYMENT_FAILED") return "FAILED";
  if (status === "REFUND_REQUESTED") return "REFUND_REQUESTED";
  if (status === "REFUNDED") return "REFUNDED";
  return "PAID";
}

/**
 * An order in `status` with order items. Without `items`, one new dish (quantity 2) is created in the shop.
 * Fixtures write the status directly: they set up state, they do not perform status changes.
 */
export async function createOrderWith(opts: {
  customerId: string;
  shopId: string;
  status?: OrderStatus;
  items?: { menuItemId: string; name: string; quantity: number; pricePaise: number }[];
  createdAt?: Date;
}) {
  const status = opts.status ?? "PLACED_PAID";
  let items = opts.items;
  if (!items) {
    const dish = await createDish(opts.shopId);
    items = [{ menuItemId: dish.id, name: dish.name, quantity: 2, pricePaise: dish.pricePaise }];
  }
  return prisma.order.create({
    data: {
      orderNumber: `T${uid()}`,
      customerId: opts.customerId,
      shopId: opts.shopId,
      status,
      paymentStatus: paymentStatusFor(status),
      // Paid orders carry a payment id, as they would after checkout (refunds need it).
      stripePaymentId: status === "PENDING_PAYMENT" || status === "PAYMENT_FAILED" ? null : `pi_test_${uid()}`,
      totalPaise: items.reduce((sum, i) => sum + i.quantity * i.pricePaise, 0),
      ...(opts.createdAt ? { createdAt: opts.createdAt } : {}),
      items: {
        create: items.map((i) => ({
          menuItemId: i.menuItemId,
          nameAtOrder: i.name,
          quantity: i.quantity,
          pricePaiseAtOrder: i.pricePaise,
        })),
      },
    },
  });
}

/** Cookie header value carrying a valid session for `user`. */
export async function sessionCookie(user: { id: string; role: Role }): Promise<string> {
  return `pec_session=${await signSession({ userId: user.id, role: user.role })}`;
}

interface RequestOptions {
  method?: string;
  cookie?: string;
  json?: unknown;
  form?: FormData;
}

/** Builds a Request like the browser would send to an API route. */
export function apiRequest(path: string, { method, cookie, json, form }: RequestOptions = {}): Request {
  const headers = new Headers();
  if (cookie) headers.set("cookie", cookie);
  let body: BodyInit | undefined;
  if (json !== undefined) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(json);
  } else if (form) {
    body = form;
  }
  return new Request(`http://localhost:3000${path}`, { method: method ?? (body ? "POST" : "GET"), headers, body });
}

/** The session cookie a response sets: its value ('' when cleared) and max-age, or null if it does not touch it. */
export function sessionCookieFrom(res: Response): { value: string; maxAge: number | null } | null {
  for (const header of res.headers.getSetCookie()) {
    if (!header.startsWith("pec_session=")) continue;
    const value = header.slice("pec_session=".length).split(";")[0] ?? "";
    const maxAge = /max-age=(\d+)/i.exec(header)?.[1];
    return { value, maxAge: maxAge === undefined ? null : Number(maxAge) };
  }
  return null;
}

// Smallest valid image headers, padded so the files are realistic but tiny.
export const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...new Array(24).fill(0)]);
export const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new Array(28).fill(0)]);

export function imageFile(bytes: Uint8Array<ArrayBuffer> = PNG_BYTES, name = "logo.png", type = "image/png"): File {
  return new File([bytes], name, { type });
}
