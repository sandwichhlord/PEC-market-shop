// Seed per SPEC §10. Idempotent: every row is upserted by a fixed unique key with `update: {}`, so running it
// again never duplicates rows and never overwrites changes made through the app.
import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import type { NotificationType, OrderStatus } from "../src/generated/prisma/enums";
import { transition, type TransitionActor } from "../src/lib/order-state";
import { CUSTOMER_STATUS_MESSAGE } from "../src/lib/order-status";
import { placeholderSvg } from "../src/lib/placeholder-svg";
import {
  SEED_ADMIN,
  SEED_CUSTOMERS,
  SEED_ORDERS,
  SEED_PASSWORDS,
  SEED_REPORTS,
  SEED_SHOPS,
  type SeedStep,
} from "./seed-data";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR ?? "./uploads");
const SEED_IMAGE_DIR = path.join(UPLOAD_DIR, "seed");
const seedImageUrl = (file: string) => `/api/uploads/seed/${file}`;

const ACTOR_ROLE: Record<SeedStep["by"], TransitionActor> = {
  customer: "CUSTOMER",
  shop: "SHOP_OWNER",
  system: "SYSTEM",
  admin: "ADMIN",
};

const STATUS_TEXT = CUSTOMER_STATUS_MESSAGE;

async function writeImages(): Promise<void> {
  await mkdir(SEED_IMAGE_DIR, { recursive: true });
  const writes: Promise<void>[] = [];
  for (const shop of SEED_SHOPS) {
    writes.push(
      writeFile(
        path.join(SEED_IMAGE_DIR, `${shop.key}-logo.svg`),
        placeholderSvg({ label: shop.name, color: shop.color, kind: "logo" }),
      ),
    );
    for (const dish of shop.dishes) {
      writes.push(
        writeFile(
          path.join(SEED_IMAGE_DIR, `${shop.key}-${dish.key}.svg`),
          placeholderSvg({ label: dish.name, color: shop.color, kind: "dish" }),
        ),
      );
    }
  }
  await Promise.all(writes);
}

async function upsertUser(data: {
  id: string;
  email: string;
  name: string;
  role: "ADMIN" | "SHOP_OWNER" | "CUSTOMER";
  password: string;
  phone?: string;
}) {
  return prisma.user.upsert({
    where: { email: data.email },
    update: {},
    create: {
      id: data.id,
      email: data.email,
      name: data.name,
      role: data.role,
      phone: data.phone,
      passwordHash: await bcrypt.hash(data.password, 10),
    },
  });
}

async function main(): Promise<void> {
  await writeImages();

  await upsertUser({ id: "seed_admin", ...SEED_ADMIN, role: "ADMIN", password: SEED_PASSWORDS.admin });

  const customerIds = new Map<string, string>();
  for (const c of SEED_CUSTOMERS) {
    const user = await upsertUser({
      id: `seed_${c.key}`,
      email: c.email,
      name: c.name,
      phone: c.phone,
      role: "CUSTOMER",
      password: SEED_PASSWORDS.customer,
    });
    customerIds.set(c.key, user.id);
  }

  const shopIds = new Map<string, string>();
  const ownerIds = new Map<string, string>();
  const dishes = new Map<string, { id: string; name: string; pricePaise: number }>();
  for (const s of SEED_SHOPS) {
    const owner = await upsertUser({
      id: `seed_${s.key}_owner`,
      email: s.ownerEmail,
      name: s.ownerName,
      phone: s.ownerPhone,
      role: "SHOP_OWNER",
      password: SEED_PASSWORDS.shop,
    });
    const shop = await prisma.shop.upsert({
      where: { ownerId: owner.id },
      update: {},
      create: {
        id: `seed_${s.key}`,
        ownerId: owner.id,
        name: s.name,
        description: s.description,
        location: s.location,
        isOpen: s.isOpen,
        logoUrl: seedImageUrl(`${s.key}-logo.svg`),
      },
    });
    shopIds.set(s.key, shop.id);
    ownerIds.set(s.key, owner.id);
    for (const d of s.dishes) {
      const item = await prisma.menuItem.upsert({
        where: { id: `seed_${s.key}_${d.key}` },
        update: {},
        create: {
          id: `seed_${s.key}_${d.key}`,
          shopId: shop.id,
          name: d.name,
          description: d.description,
          pricePaise: d.pricePaise,
          prepTimeMinutes: d.prepTimeMinutes,
          inStock: d.inStock ?? true,
          photoUrl: seedImageUrl(`${s.key}-${d.key}.svg`),
        },
      });
      dishes.set(`${s.key}/${d.key}`, item);
    }
  }

  let createdOrders = 0;
  const now = Date.now();
  for (const o of SEED_ORDERS) {
    if (await prisma.order.findUnique({ where: { orderNumber: o.orderNumber }, select: { id: true } })) continue;

    const customerId = customerIds.get(o.customer)!;
    const shopId = shopIds.get(o.shop)!;
    const shopOwnerId = ownerIds.get(o.shop)!;
    const createdAt = new Date(now - o.minutesAgo * 60_000);
    const at = (minute: number) => new Date(createdAt.getTime() + minute * 60_000);

    const lines = o.items.map((line) => {
      const dish = dishes.get(`${o.shop}/${line.dish}`);
      if (!dish) throw new Error(`Seed order ${o.orderNumber}: unknown dish ${o.shop}/${line.dish}`);
      return { dish, quantity: line.quantity, refunded: line.refunded ?? false };
    });
    const totalPaise = lines.reduce((sum, l) => sum + l.dish.pricePaise * l.quantity, 0);

    // Walk the history through the real state machine so seeded orders are always reachable states.
    let status: OrderStatus = "PENDING_PAYMENT";
    let beforeDispute: OrderStatus | null = null;
    const events: {
      fromStatus: OrderStatus | null;
      toStatus: OrderStatus;
      actorId: string | null;
      note?: string;
      createdAt: Date;
    }[] = [{ fromStatus: null, toStatus: "PENDING_PAYMENT", actorId: customerId, createdAt }];
    const actorIdFor = (by: SeedStep["by"]) =>
      by === "customer" ? customerId : by === "shop" ? shopOwnerId : by === "admin" ? "seed_admin" : null;
    for (const step of o.steps) {
      const next = transition(status, step.to, ACTOR_ROLE[step.by], { previousStatus: beforeDispute });
      if (next === "REFUND_REQUESTED") beforeDispute = status;
      events.push({
        fromStatus: status,
        toStatus: next,
        actorId: actorIdFor(step.by),
        note: step.note,
        createdAt: at(step.atMinute),
      });
      status = next;
    }
    const updatedAt = events[events.length - 1]!.createdAt;
    const paidAt = events.find((e) => e.toStatus === "PLACED_PAID")?.createdAt;

    await prisma.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: {
          orderNumber: o.orderNumber,
          customerId,
          shopId,
          status,
          totalPaise,
          paymentStatus: o.paymentStatus,
          refundedPaise: o.fullyRefunded ? totalPaise : 0,
          createdAt,
          updatedAt,
          items: {
            create: lines.map((l) => ({
              menuItemId: l.dish.id,
              nameAtOrder: l.dish.name,
              quantity: l.quantity,
              pricePaiseAtOrder: l.dish.pricePaise,
              refunded: l.refunded,
            })),
          },
          events: { create: events },
        },
        include: { items: true },
      });

      // Notifications mirroring what the app sends: shop hears about new paid orders, customer about status changes.
      const link = `/orders/${order.id}`;
      const notifications: {
        userId: string;
        type: NotificationType;
        title: string;
        body: string;
        link: string;
        createdAt: Date;
        readAt: Date | null;
      }[] = [];
      const isOld = o.minutesAgo > 60;
      if (paidAt) {
        notifications.push({
          userId: shopOwnerId,
          type: "NEW_ORDER",
          title: `New order ${o.orderNumber}`,
          body: `${lines.length} item(s) — paid online.`,
          link: `/shop/orders/${order.id}`,
          createdAt: paidAt,
          readAt: isOld ? paidAt : null,
        });
      }
      for (const e of events.slice(1)) {
        const body = STATUS_TEXT[e.toStatus];
        if (!body || e.actorId === customerId) continue;
        notifications.push({
          userId: customerId,
          type: "ORDER_STATUS",
          title: `Order ${o.orderNumber}`,
          body,
          link,
          createdAt: e.createdAt,
          readAt: isOld ? e.createdAt : null,
        });
      }
      if (notifications.length > 0) await tx.notification.createMany({ data: notifications });

      if (o.review) {
        await tx.review.create({
          data: {
            orderId: order.id,
            customerId,
            shopId,
            rating: o.review.rating,
            comment: o.review.comment,
            photos: (o.review.photoDishes ?? []).map((d) => seedImageUrl(`${o.shop}-${d}.svg`)),
            createdAt: at(60),
          },
        });
      }

      if (o.complaint) {
        const refundItems = order.items.filter((i) => i.refunded);
        await tx.complaint.create({
          data: {
            orderId: order.id,
            raisedById: customerId,
            type: o.complaint.type,
            description: o.complaint.description,
            itemIds: o.complaint.type === "REFUND" ? refundItems.map((i) => i.id) : [],
            refundAmountPaise:
              o.complaint.type === "REFUND"
                ? refundItems.reduce((sum, i) => sum + i.pricePaiseAtOrder * i.quantity, 0)
                : null,
            status: o.complaint.status,
            shopResponse: o.complaint.shopResponse,
            resolution: o.complaint.resolution,
            createdAt: events.find((e) => e.toStatus === "REFUND_REQUESTED" || e.toStatus === "COMPLAINT_FILED")
              ?.createdAt,
          },
        });
      }
    });
    createdOrders++;
  }

  for (const r of SEED_REPORTS) {
    const orderId = r.orderNumber
      ? (await prisma.order.findUnique({ where: { orderNumber: r.orderNumber }, select: { id: true } }))?.id
      : undefined;
    await prisma.customerReport.upsert({
      where: { id: r.id },
      update: {},
      create: {
        id: r.id,
        shopId: shopIds.get(r.shop)!,
        customerId: customerIds.get(r.customer)!,
        orderId,
        reason: r.reason,
        description: r.description,
      },
    });
  }

  const counts = {
    users: await prisma.user.count(),
    shops: await prisma.shop.count(),
    menuItems: await prisma.menuItem.count(),
    orders: await prisma.order.count(),
    reviews: await prisma.review.count(),
  };
  console.log(`Seed complete (${createdOrders} new order(s)).`, counts);
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
