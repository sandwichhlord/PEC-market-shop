import { CustomerShell } from "@/components/shell/CustomerShell";
import { requirePageUser } from "@/server/auth/current";

export default async function CustomerLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageUser("CUSTOMER");
  return <CustomerShell warning={user.status === "WARNED" ? user.warningMessage : null}>{children}</CustomerShell>;
}
