import { z } from "zod";
import { CUSTOMER_ORDER_TAB_NAMES, type CustomerOrderTab } from "@/lib/order-status";

/** `?tab=` on the customer's order history: Active (default) or Past. */
export const customerOrderTabSchema = z.object({
  tab: z.enum(CUSTOMER_ORDER_TAB_NAMES as [CustomerOrderTab, ...CustomerOrderTab[]]).default("active"),
});
