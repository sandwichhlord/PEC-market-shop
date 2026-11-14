// Page helper for the shop portal: the signed-in owner and their shop.
import { notFound } from "next/navigation";
import { requirePageUser } from "@/server/auth/current";
import { getShopProfileByOwner } from "./profile";

/** For shop-portal pages: the signed-in shop owner and their shop (404 page if the account has no shop). */
export async function requirePageShop() {
  const user = await requirePageUser("SHOP_OWNER");
  const shop = await getShopProfileByOwner(user.id);
  if (!shop) notFound();
  return { user, shop };
}
