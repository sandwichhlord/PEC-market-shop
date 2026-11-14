// zod schemas for auth inputs. Shared by API routes (authoritative) and forms (early feedback).
import { z } from "zod";

const email = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ message: "Enter a valid email address." }));

const name = z.string().trim().min(2, "Name must be at least 2 characters.").max(80, "Name is too long.");

const password = z
  .string()
  .min(8, "Password must be at least 8 characters.")
  .max(72, "Password must be at most 72 characters."); // bcrypt only uses the first 72 bytes

/** Optional phone: blank → undefined; otherwise 7–15 digits with an optional leading +, spaces/dashes allowed. */
const phone = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s-]/g, ""))
  .pipe(z.union([z.literal(""), z.string().regex(/^\+?\d{7,15}$/, "Enter a valid phone number.")]))
  .transform((v) => (v === "" ? undefined : v))
  .optional();

export const customerSignupSchema = z.object({ name, email, password, phone });
export type CustomerSignupInput = z.infer<typeof customerSignupSchema>;

export const shopSignupSchema = z.object({
  name,
  email,
  password,
  phone,
  shopName: z.string().trim().min(2, "Shop name must be at least 2 characters.").max(80, "Shop name is too long."),
  shopDescription: z.string().trim().max(500, "Description must be at most 500 characters.").default(""),
  location: z.string().trim().min(2, "Enter where the shop is in the market.").max(120, "Location is too long."),
});
export type ShopSignupInput = z.infer<typeof shopSignupSchema>;

export const portalSchema = z.enum(["customer", "shop", "admin"]);

export const loginSchema = z.object({
  email,
  // No length rules on login: they would leak policy and seed accounts predate it.
  password: z.string().min(1, "Enter your password.").max(200),
  portal: portalSchema,
});
export type LoginInput = z.infer<typeof loginSchema>;
