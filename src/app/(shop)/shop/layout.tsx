import { SidebarShell } from "@/components/shell/SidebarShell";
import { requirePageUser } from "@/server/auth/current";
import { prisma } from "@/server/db";

export default async function ShopLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageUser("SHOP_OWNER");
  const shop = await prisma.shop.findUnique({ where: { ownerId: user.id }, select: { name: true } });
  return (
    <SidebarShell
      portal="shop"
      heading={shop?.name ?? "Your shop"}
      userName={user.name}
      warning={user.status === "WARNED" ? user.warningMessage : null}
    >
      {children}
    </SidebarShell>
  );
}
