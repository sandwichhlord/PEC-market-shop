import type { Metadata } from "next";
import { CartView } from "@/components/cart/CartView";
import { PageHeader } from "@/components/ui/PageHeader";

export const metadata: Metadata = { title: "Cart · PEC Market" };

export default function CartPage() {
  return (
    <>
      <PageHeader title="Your cart" />
      <CartView />
    </>
  );
}
