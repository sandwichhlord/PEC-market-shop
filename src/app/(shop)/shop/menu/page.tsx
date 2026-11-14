import type { Metadata } from "next";
import { MenuManager } from "@/components/shop/MenuManager";
import { PageHeader } from "@/components/ui/PageHeader";
import { requirePageShop } from "@/server/shops/current";
import { listOwnerMenu } from "@/server/shops/menu";

export const metadata: Metadata = { title: "Menu · PEC Market shop" };

export default async function ShopMenuPage() {
  const { shop } = await requirePageShop();
  const dishes = await listOwnerMenu(shop.id);
  return (
    <>
      <PageHeader title="Menu" description="Add and edit dishes, and switch stock on or off with one tap." />
      <MenuManager shopId={shop.id} initialDishes={dishes} />
    </>
  );
}
