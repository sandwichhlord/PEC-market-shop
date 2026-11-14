import type { Metadata } from "next";
import { AuthPanel } from "@/components/auth/AuthPanel";
import { ShopSignupForm } from "@/components/auth/ShopSignupForm";

export const metadata: Metadata = { title: "Register your shop · PEC Market" };

export default function ShopSignupPage() {
  return (
    <AuthPanel title="Register your shop" subtitle="Create your owner account and your shop in one step.">
      <ShopSignupForm />
    </AuthPanel>
  );
}
