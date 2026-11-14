import { z } from "zod";

const id = z.string().trim().min(1).max(64);

/** `POST /api/orders/:orderId/refund-request`: some items or the whole order, plus a reason (SPEC §6). */
export const refundRequestSchema = z
  .object({
    wholeOrder: z.boolean().default(false),
    itemIds: z.array(id).max(50).default([]),
    reason: z.string().trim().min(5, "Tell the shop why (at least 5 characters).").max(500, "Keep the reason under 500 characters."),
  })
  .refine((v) => v.wholeOrder || v.itemIds.length > 0, { message: "Choose the items to refund, or the whole order.", path: ["itemIds"] })
  .refine((v) => new Set(v.itemIds).size === v.itemIds.length, { message: "Each item may appear only once.", path: ["itemIds"] });
export type RefundRequestInput = z.infer<typeof refundRequestSchema>;

/** `POST /api/orders/:orderId/complaints`: free text. */
export const complaintSchema = z.object({
  description: z
    .string()
    .trim()
    .min(10, "Describe the problem (at least 10 characters).")
    .max(1000, "Keep the complaint under 1000 characters."),
});

/** `POST /api/shops/:shopId/disputes/:complaintId`: the shop's response to a refund request or complaint. */
export const disputeActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("approve"), message: z.string().trim().max(500).optional() }),
  z.object({
    action: z.literal("reject"),
    reason: z.string().trim().min(5, "Give the customer a reason (at least 5 characters).").max(500),
  }),
  z.object({ action: z.literal("reply"), message: z.string().trim().min(1, "Write a reply.").max(1000) }),
  z.object({ action: z.literal("resolve"), resolution: z.string().trim().max(1000).optional() }),
]);
export type DisputeAction = z.infer<typeof disputeActionSchema>;

export const disputeParamsSchema = z.object({ shopId: id, complaintId: id });
