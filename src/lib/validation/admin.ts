import { z } from "zod";

const id = z.string().trim().min(1).max(64);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Keep it under ${max} characters.`)
    .optional()
    .transform((v) => (v ? v : undefined));
const emptyToUndefined = (v: unknown) => (v === "" || v === null ? undefined : v);

export const adminIdSchema = z.object({ id });

// ---- Customer reports (shop → admin) ----

export const REPORT_REASONS = ["NO_SHOW", "MISBEHAVIOR", "OTHER"] as const;

/** `POST /api/shops/:shopId/orders/:orderId/report` — a shop flags the order's customer (SPEC §3). */
export const customerReportSchema = z.object({
  reason: z.enum(REPORT_REASONS, { error: "Choose a reason." }),
  description: z
    .string()
    .trim()
    .min(10, "Describe what happened (at least 10 characters).")
    .max(1000, "Keep the description under 1000 characters."),
});
export type CustomerReportInput = z.infer<typeof customerReportSchema>;

// ---- Account actions (reports queue and users list) ----

const warningMessage = z
  .string()
  .trim()
  .min(5, "Write the warning the user will see (at least 5 characters).")
  .max(500, "Keep the warning under 500 characters.");

/** Account actions on a user. Admin accounts cannot be targeted (checked in the service). */
export const accountActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("warn"), message: warningMessage }),
  z.object({ action: z.literal("suspend") }),
  z.object({ action: z.literal("reinstate") }),
]);
export type AccountAction = z.infer<typeof accountActionSchema>;

/** `POST /api/admin/reports/:id` — act on a report: an account action against the customer, or dismiss it. */
export const reportActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("warn"), message: warningMessage, note: optionalText(1000) }),
  z.object({ action: z.literal("suspend"), note: optionalText(1000) }),
  z.object({ action: z.literal("reinstate"), note: optionalText(1000) }),
  z.object({ action: z.literal("dismiss"), note: optionalText(1000) }),
]);
export type ReportAction = z.infer<typeof reportActionSchema>;

// ---- Disputes ----

/** `POST /api/admin/disputes/:id` — force a refund (chosen items or every unrefunded item) or resolve with a note. */
export const adminDisputeActionSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("refund"),
      wholeOrder: z.boolean().default(false),
      itemIds: z.array(id).max(50).default([]),
      note: z.string().trim().min(3, "Add a note for the customer and the shop (at least 3 characters).").max(1000),
    })
    .refine((v) => v.wholeOrder || v.itemIds.length > 0, { message: "Choose the items to refund, or the whole order.", path: ["itemIds"] })
    .refine((v) => new Set(v.itemIds).size === v.itemIds.length, { message: "Each item may appear only once.", path: ["itemIds"] }),
  z.object({
    action: z.literal("resolve"),
    note: z.string().trim().min(3, "Explain the decision (at least 3 characters).").max(1000),
  }),
]);
export type AdminDisputeAction = z.infer<typeof adminDisputeActionSchema>;

// ---- List filters ----

export const DISPUTE_FILTERS = ["active", "OPEN", "ESCALATED", "RESOLVED", "REJECTED", "all"] as const;
export type DisputeFilter = (typeof DISPUTE_FILTERS)[number];

export const disputeListSchema = z.object({
  status: z.preprocess(emptyToUndefined, z.enum(DISPUTE_FILTERS).default("active")),
  shopId: z.preprocess(emptyToUndefined, id.optional()),
  type: z.preprocess(emptyToUndefined, z.enum(["REFUND", "COMPLAINT"]).optional()),
});
export type DisputeListQuery = z.infer<typeof disputeListSchema>;

export const REPORT_FILTERS = ["OPEN", "ACTIONED", "DISMISSED", "all"] as const;
export const reportListSchema = z.object({
  status: z.preprocess(emptyToUndefined, z.enum(REPORT_FILTERS).default("OPEN")),
});
export type ReportListQuery = z.infer<typeof reportListSchema>;

export const userListSchema = z.object({
  q: z.preprocess(emptyToUndefined, z.string().trim().max(80, "Search is too long.").optional()),
  role: z.preprocess(emptyToUndefined, z.enum(["CUSTOMER", "SHOP_OWNER", "ADMIN"]).optional()),
  status: z.preprocess(emptyToUndefined, z.enum(["ACTIVE", "WARNED", "SUSPENDED"]).optional()),
});
export type UserListQuery = z.infer<typeof userListSchema>;

export const shopListSchema = z.object({
  q: z.preprocess(emptyToUndefined, z.string().trim().max(80, "Search is too long.").optional()),
});
