import { SidebarShell } from "@/components/shell/SidebarShell";
import { requirePageUser } from "@/server/auth/current";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageUser("ADMIN");
  return (
    <SidebarShell portal="admin" heading="Market administration" userName={user.name} warning={null}>
      {children}
    </SidebarShell>
  );
}
