import { Bell } from "lucide-react";
import type { Metadata } from "next";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { formatDateTime } from "@/lib/datetime";
import { requirePageUser } from "@/server/auth/current";
import { listNotifications } from "@/server/notifications/list";

export const metadata: Metadata = { title: "Notifications · PEC Market" };

export default async function NotificationsPage() {
  const user = await requirePageUser("CUSTOMER");
  const notifications = await listNotifications(user.id);
  return (
    <>
      <PageHeader title="Notifications" />
      {notifications.length === 0 ? (
        <EmptyState icon={Bell} title="You're all caught up">
          Updates about your orders will appear here.
        </EmptyState>
      ) : (
        <ul className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white">
          {notifications.map((n) => (
            <li key={n.id} className={`p-4 ${n.readAt ? "" : "bg-orange-50/60"}`}>
              <p className="font-medium text-slate-900">
                {!n.readAt && <span className="sr-only">Unread: </span>}
                {n.title}
              </p>
              <p className="text-sm text-slate-600">{n.body}</p>
              <p className="mt-1 text-xs text-slate-400">{formatDateTime(n.createdAt)}</p>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
