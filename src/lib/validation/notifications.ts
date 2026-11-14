import { z } from "zod";

/** `POST /api/notifications/read`: either some ids or everything. */
export const markReadSchema = z.union([
  z.object({ all: z.literal(true) }).strict(),
  z.object({ ids: z.array(z.string().trim().min(1).max(64)).min(1).max(100) }).strict(),
]);
