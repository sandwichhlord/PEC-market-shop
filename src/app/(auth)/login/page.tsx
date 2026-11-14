import type { Metadata } from "next";
import { LoginPage, type LoginSearchParams } from "@/components/auth/LoginPage";

export const metadata: Metadata = { title: "Log in · PEC Market" };

export default function CustomerLoginPage({ searchParams }: { searchParams: LoginSearchParams }) {
  return <LoginPage portal="customer" searchParams={searchParams} />;
}
