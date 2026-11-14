import type { Metadata } from "next";
import { NotificationsPage } from "@/components/notifications/NotificationsPage";
import { requirePageUser } from "@/server/auth/current";

export const metadata: Metadata = { title: "Notifications · PEC Market" };

export default async function CustomerNotificationsPage() {
  await requirePageUser("CUSTOMER");
  return <NotificationsPage />;
}
