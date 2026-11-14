import { Alert } from "@/components/ui/Alert";
import { SUSPENDED_MESSAGE } from "@/lib/account";
import type { Portal } from "@/lib/portals";
import { AuthPanel } from "./AuthPanel";
import { LoginForm } from "./LoginForm";

const COPY: Record<Portal, { title: string; subtitle: string; signupHref?: string }> = {
  customer: { title: "Log in", subtitle: "Order from the shops in the PEC market.", signupHref: "/signup" },
  shop: { title: "Shop owner login", subtitle: "Manage your menu and incoming orders.", signupHref: "/shop/signup" },
  admin: { title: "Admin login", subtitle: "Market administration." },
};

export type LoginSearchParams = Promise<{ next?: string | string[]; reason?: string | string[] }>;

/** Shared body of the three login pages. */
export async function LoginPage({ portal, searchParams }: { portal: Portal; searchParams: LoginSearchParams }) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : undefined;
  const { title, subtitle, signupHref } = COPY[portal];
  return (
    <AuthPanel title={title} subtitle={subtitle}>
      {params.reason === "suspended" && (
        <div className="mb-4">
          <Alert tone="error">{SUSPENDED_MESSAGE}</Alert>
        </div>
      )}
      <LoginForm portal={portal} next={next} signupHref={signupHref} />
    </AuthPanel>
  );
}
