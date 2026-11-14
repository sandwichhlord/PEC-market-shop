// zod schemas for the shop portal (menu, profile, orders). Shared by API routes (authoritative) and forms.
import { z } from "zod";
import { KITCHEN_TARGETS, SHOP_ORDER_FILTERS, type ShopOrderFilter } from "@/lib/order-status";

export const MIN_PRICE_PAISE = 100; // ₹1
export const MAX_PRICE_PAISE = 500_000; // ₹5,000
export const MAX_PREP_MINUTES = 180;

/** Multipart forms send booleans as "true"/"false" (checkboxes as "on"); JSON sends real booleans. */
const formBoolean = z.union([
  z.boolean(),
  z.enum(["true", "false", "on"]).transform((v) => v !== "false"),
]);

const dishName = z.string().trim().min(2, "Dish name must be at least 2 characters.").max(80, "Dish name is too long.");
const dishDescription = z.string().trim().max(500, "Description must be at most 500 characters.");
const pricePaise = z.coerce
  .number({ message: "Enter a price." })
  .int("Price must be a whole number of paise.")
  .min(MIN_PRICE_PAISE, "Price must be at least ₹1.")
  .max(MAX_PRICE_PAISE, "Price must be at most ₹5,000.");
const prepTimeMinutes = z.coerce
  .number({ message: "Enter a prep time." })
  .int("Prep time must be whole minutes.")
  .min(1, "Prep time must be at least 1 minute.")
  .max(MAX_PREP_MINUTES, `Prep time must be at most ${MAX_PREP_MINUTES} minutes.`);

export const menuItemCreateSchema = z.object({
  name: dishName,
  description: dishDescription.default(""),
  pricePaise,
  prepTimeMinutes,
  inStock: formBoolean.default(true),
});
export type MenuItemCreateInput = z.infer<typeof menuItemCreateSchema>;

/** Edits are partial: only the fields sent are changed. */
export const menuItemUpdateSchema = z.object({
  name: dishName.optional(),
  description: dishDescription.optional(),
  pricePaise: pricePaise.optional(),
  prepTimeMinutes: prepTimeMinutes.optional(),
  inStock: formBoolean.optional(),
});
export type MenuItemUpdateInput = z.infer<typeof menuItemUpdateSchema>;

export const stockSchema = z.object({ inStock: z.boolean({ message: "inStock must be true or false." }) });

export const shopProfileSchema = z.object({
  name: z.string().trim().min(2, "Shop name must be at least 2 characters.").max(80, "Shop name is too long.").optional(),
  description: z.string().trim().max(500, "Description must be at most 500 characters.").optional(),
  location: z.string().trim().min(2, "Enter where the shop is in the market.").max(120, "Location is too long.").optional(),
  isOpen: formBoolean.optional(),
});
export type ShopProfileInput = z.infer<typeof shopProfileSchema>;

const id = z.string().trim().min(1).max(64);
export const menuItemParamsSchema = z.object({ shopId: id, itemId: id });
export const shopOrderParamsSchema = z.object({ shopId: id, orderId: id });

export const shopOrderFilterSchema = z.object({
  filter: z
    .enum(Object.keys(SHOP_ORDER_FILTERS) as [ShopOrderFilter, ...ShopOrderFilter[]])
    .default("active"),
});

export const kitchenStatusSchema = z.object({
  to: z.enum(KITCHEN_TARGETS as [(typeof KITCHEN_TARGETS)[number], ...(typeof KITCHEN_TARGETS)[number][]], {
    message: "Shops can only move orders to Preparing, Ready for pickup or Completed here.",
  }),
});

/** "45", "45.5", "45.50" rupees → paise. Returns null for anything that is not a non-negative amount with ≤2 decimals. */
export function rupeesToPaise(input: string): number | null {
  const s = input.trim();
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(s)) return null;
  const [whole, frac = ""] = s.split(".");
  return Number(whole) * 100 + Number(frac.padEnd(2, "0"));
}

/** Text fields of the dish form (multipart; the photo is the `photo` file field). */
export const MENU_FIELDS = ["name", "description", "pricePaise", "prepTimeMinutes", "inStock"] as const;
/** Text fields of the shop profile form (multipart; the logo is the `logo` file field). */
export const PROFILE_FIELDS = ["name", "description", "location", "isOpen"] as const;
