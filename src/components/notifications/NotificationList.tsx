"use client";

import { useRouter } from "next/navigation";
import { formatDateTime } from "@/lib/datetime";
import type { NotificationItem } from "./NotificationsProvider";

/** Notifications, newest first. Unread ones are tinted; opening one marks it read and follows its link. */
export function NotificationList({
  items,
  onOpen,
  compact = false,
}: {
  items: NotificationItem[];
  onOpen: (n: NotificationItem) => void;
  compact?: boolean;
}) {
  const router = useRouter();
  return (
    <ul aria-label="Notifications" className="divide-y divide-slate-200">
      {items.map((n) => (
        <li key={n.id} data-unread={n.readAt === null}>
          <button
            type="button"
            onClick={() => {
              onOpen(n);
              if (n.link) router.push(n.link);
            }}
            className={`block w-full text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-orange-600 ${
              compact ? "px-3 py-2.5" : "p-4"
            } ${n.readAt ? "hover:bg-slate-50" : "bg-orange-50/60 hover:bg-orange-50"}`}
          >
            <span className="flex items-start gap-2">
              {!n.readAt && <span aria-hidden="true" className="mt-1.5 size-2 shrink-0 rounded-full bg-orange-600" />}
              <span className="min-w-0">
                <span className="block font-medium text-slate-900">
                  {!n.readAt && <span className="sr-only">Unread: </span>}
                  {n.title}
                </span>
                <span className="block text-sm text-slate-600">{n.body}</span>
                <time dateTime={n.createdAt} className="mt-0.5 block text-xs text-slate-400">
                  {formatDateTime(n.createdAt)}
                </time>
              </span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
