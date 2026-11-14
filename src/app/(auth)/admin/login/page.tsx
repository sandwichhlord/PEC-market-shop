import type { Metadata } from "next";
import { LoginPage, type LoginSearchParams } from "@/components/auth/LoginPage";

export const metadata: Metadata = { title: "Admin login · PEC Market" };

export default function AdminLoginPage({ searchParams }: { searchParams: LoginSearchParams }) {
  return <LoginPage portal="admin" searchParams={searchParams} />;
}
