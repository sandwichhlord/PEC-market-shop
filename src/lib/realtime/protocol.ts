// The small client → server Socket.IO protocol, shared by both sides. Server → client events are the
// RealtimeEvent types in src/server/realtime/emit.ts.
import { z } from "zod";

/** A room a page asks to listen to while it is open: one order's updates, or one shop's menu. */
export const subscriptionSchema = z.object({
  kind: z.enum(["order", "menu"]),
  id: z.string().trim().min(1).max(64),
});
export type Subscription = z.infer<typeof subscriptionSchema>;

export type SubscribeAck = { ok: true } | { ok: false; error: "BAD_REQUEST" | "NOT_FOUND" | "INTERNAL" };
