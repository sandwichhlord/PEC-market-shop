"use client";

import { Bell } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { PageHeader } from "@/components/ui/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { NotificationList } from "./NotificationList";
import { useNotifications } from "./NotificationsProvider";

/** The customer's full notification list (live: new ones appear at the top). */
export function NotificationsPage() {
  const { items, unreadCount, status, markRead, markAllRead, reload } = useNotifications();
  return (
    <>
      <PageHeader
        title="Notifications"
        description={unreadCount > 0 ? `${unreadCount} unread` : undefined}
        actions={
          items.length > 0 && (
            <Button variant="secondary" onClick={markAllRead} disabled={unreadCount === 0}>
              Mark all as read
            </Button>
          )
        }
      />
      {status === "loading" && (
        <div aria-busy="true" aria-label="Loading notifications" className="space-y-2">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      )}
      {status === "error" && <ErrorState title="Couldn’t load notifications" onRetry={reload} />}
      {status === "ready" &&
        (items.length === 0 ? (
          <EmptyState icon={Bell} title="You're all caught up">
            Updates about your orders will appear here.
          </EmptyState>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <NotificationList items={items} onOpen={(n) => !n.readAt && markRead([n.id])} />
          </div>
        ))}
    </>
  );
}
