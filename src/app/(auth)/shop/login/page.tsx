import type { Metadata } from "next";
import { LoginPage, type LoginSearchParams } from "@/components/auth/LoginPage";

export const metadata: Metadata = { title: "Shop login · PEC Market" };

export default function ShopLoginPage({ searchParams }: { searchParams: LoginSearchParams }) {
  return <LoginPage portal="shop" searchParams={searchParams} />;
}
