import { z } from "zod";

/** `?q=` on the shops list: trimmed, empty means "no filter". */
export const shopSearchSchema = z.object({
  q: z
    .string()
    .trim()
    .max(80, "Search is too long.")
    .optional()
    .transform((q) => (q ? q : undefined)),
});

export const shopIdSchema = z.object({ shopId: z.string().trim().min(1).max(64) });
