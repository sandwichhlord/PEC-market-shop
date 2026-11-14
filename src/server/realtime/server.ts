// Socket.IO connection handling (attached in server.ts). The session JWT cookie is checked on the handshake, so
// only signed-in, non-suspended users connect. Every socket joins its own rooms straight away — `user:<id>`, plus
// `shop:<id>` for shop owners and `admin` for admins — and may subscribe to `order:<id>` (orders it may see) and
// `menu:<shopId>` (any visible shop) while a page that needs them is open.
import type { Server, Socket } from "socket.io";
import type { Role } from "@/generated/prisma/enums";
import { SHOP_VISIBLE_STATUSES } from "@/lib/order-status";
import { subscriptionSchema, type SubscribeAck } from "@/lib/realtime/protocol";
import { loadSessionUser, orderAccessFor } from "@/server/auth/access";
import { SESSION_COOKIE, verifySession } from "@/server/auth/jwt";
import { readCookie } from "@/server/auth/session";
import { prisma } from "@/server/db";

export interface SocketUser {
  id: string;
  role: Role;
}

interface SocketData {
  user: SocketUser;
  homeRooms: string[];
}

type AppSocket = Socket<Record<string, never>, Record<string, never>, Record<string, never>, SocketData>;

/** Handshake errors (the client sees them as `connect_error` with this message). */
export const SOCKET_ERRORS = { unauthenticated: "UNAUTHENTICATED", suspended: "ACCOUNT_SUSPENDED" } as const;

/** The rooms a user always listens to. */
export async function homeRoomsFor(user: SocketUser): Promise<string[]> {
  const rooms = [`user:${user.id}`];
  if (user.role === "SHOP_OWNER") {
    const shop = await prisma.shop.findUnique({ where: { ownerId: user.id }, select: { id: true } });
    if (shop) rooms.push(`shop:${shop.id}`);
  }
  if (user.role === "ADMIN") rooms.push("admin");
  return rooms;
}

/** Whether `user` may listen to `order:<orderId>` — the same rule as GET /api/orders/:orderId. */
async function mayWatchOrder(user: SocketUser, orderId: string): Promise<boolean> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { status: true, customerId: true, shop: { select: { ownerId: true } } },
  });
  if (!order) return false;
  const access = orderAccessFor(user, order);
  if (access === "shop") return SHOP_VISIBLE_STATUSES.includes(order.status);
  return access !== null;
}

/** Whether `menu:<shopId>` may be watched: the shop exists and its owner is not suspended (as on the shop page). */
async function mayWatchMenu(shopId: string): Promise<boolean> {
  const shop = await prisma.shop.findFirst({ where: { id: shopId, owner: { status: { not: "SUSPENDED" } } }, select: { id: true } });
  return shop !== null;
}

async function handleSubscribe(socket: AppSocket, raw: unknown): Promise<SubscribeAck> {
  const parsed = subscriptionSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "BAD_REQUEST" };
  const { kind, id } = parsed.data;
  const user = socket.data.user;
  const allowed = kind === "order" ? await mayWatchOrder(user, id) : await mayWatchMenu(id);
  if (!allowed) return { ok: false, error: "NOT_FOUND" };
  await socket.join(`${kind}:${id}`);
  return { ok: true };
}

/** Wires authentication, home rooms and subscriptions onto a Socket.IO server. */
export function attachRealtime(io: Server): void {
  io.use((socket: AppSocket, next) => {
    void (async () => {
      const token = readCookie(socket.handshake.headers.cookie ?? null, SESSION_COOKIE);
      const user = await loadSessionUser(await verifySession(token));
      if (!user) return next(new Error(SOCKET_ERRORS.unauthenticated));
      if (user.status === "SUSPENDED") return next(new Error(SOCKET_ERRORS.suspended));
      const socketUser = { id: user.id, role: user.role };
      socket.data.user = socketUser;
      socket.data.homeRooms = await homeRoomsFor(socketUser);
      next();
    })().catch((err: unknown) => {
      console.error("[realtime] handshake failed", err);
      next(new Error("INTERNAL"));
    });
  });

  io.on("connection", (socket: AppSocket) => {
    void socket.join(socket.data.homeRooms);

    socket.on("subscribe", (raw: unknown, ack?: unknown) => {
      handleSubscribe(socket, raw)
        .catch((err: unknown): SubscribeAck => {
          console.error("[realtime] subscribe failed", err);
          return { ok: false, error: "INTERNAL" };
        })
        .then((result) => {
          if (typeof ack === "function") ack(result);
        });
    });

    socket.on("unsubscribe", (raw: unknown) => {
      const parsed = subscriptionSchema.safeParse(raw);
      if (parsed.success) void socket.leave(`${parsed.data.kind}:${parsed.data.id}`);
    });
  });
}
