import type { Metadata } from "next";
import { ShopProfileForm } from "@/components/shop/ShopProfileForm";
import { PageHeader } from "@/components/ui/PageHeader";
import { requirePageShop } from "@/server/shops/current";

export const metadata: Metadata = { title: "Shop profile · PEC Market shop" };

export default async function ShopProfilePage() {
  const { shop } = await requirePageShop();
  return (
    <>
      <PageHeader title="Shop profile" description="What customers see on the shops list and your menu page." />
      <ShopProfileForm shop={shop} />
    </>
  );
}
