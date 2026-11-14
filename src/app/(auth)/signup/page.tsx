import type { Metadata } from "next";
import { AuthPanel } from "@/components/auth/AuthPanel";
import { CustomerSignupForm } from "@/components/auth/CustomerSignupForm";

export const metadata: Metadata = { title: "Sign up · PEC Market" };

export default function CustomerSignupPage() {
  return (
    <AuthPanel title="Create your account" subtitle="Order food from the PEC market and track it live.">
      <CustomerSignupForm />
    </AuthPanel>
  );
}
