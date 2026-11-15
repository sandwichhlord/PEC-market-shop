// The small client → server Socket.IO protocol, shared by both sides. Server → client events are the
// RealtimeEvent types in src/server/realtime/emit.ts.
import { z } from "zod";

/**
 * A room a page asks to listen to while it is open: one order's updates, one shop's menu, or the shops list
 * (`{ kind: "shops", id: "all" }`: open/closed and rating changes of every shop).
 */
export const subscriptionSchema = z.object({
  kind: z.enum(["order", "menu", "shops"]),
  id: z.string().trim().min(1).max(64),
});

/** The one shops-list subscription (room `shops:all`). */
export const SHOPS_LIST_SUBSCRIPTION = { kind: "shops", id: "all" } as const satisfies Subscription;
export type Subscription = z.infer<typeof subscriptionSchema>;

export type SubscribeAck = { ok: true } | { ok: false; error: "BAD_REQUEST" | "NOT_FOUND" | "INTERNAL" };
