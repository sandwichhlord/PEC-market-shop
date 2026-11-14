"use client";

import { Bell } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { NotificationList } from "./NotificationList";
import { useNotifications } from "./NotificationsProvider";

/** Unread count as a small badge (shared by the bell and the customer's Notifications tab). */
export function UnreadBadge({ count, className = "" }: { count: number; className?: string }) {
  if (count === 0) return null;
  return (
    <span
      aria-hidden="true"
      data-testid="unread-badge"
      className={`flex min-w-5 items-center justify-center rounded-full bg-orange-600 px-1 text-[11px] leading-5 font-bold text-white ${className}`}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

/**
 * Bell with the unread count; opens a panel with the latest notifications, "Mark all read", and (for customers)
 * a link to the full list. Closes on Escape or a click outside.
 */
export function NotificationBell({ allHref, align = "right" }: { allHref?: string; align?: "left" | "right" }) {
  const { items, unreadCount, status, markRead, markAllRead, reload } = useNotifications();
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onClick = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  const recent = items.slice(0, 10);
  return (
    <div ref={root} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
        className="relative inline-flex size-10 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-orange-600"
      >
        <Bell aria-hidden="true" className="size-5" />
        <UnreadBadge count={unreadCount} className="absolute -top-0.5 -right-0.5" />
      </button>
      {open && (
        <div
          id={panelId}
          role="region"
          aria-label="Notifications panel"
          className={`absolute top-12 z-50 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
            <p className="text-sm font-semibold text-slate-900">Notifications</p>
            <button
              type="button"
              onClick={markAllRead}
              disabled={unreadCount === 0}
              className="rounded-md px-2 py-1 text-xs font-medium text-orange-700 hover:bg-orange-50 focus-visible:outline-2 focus-visible:outline-orange-600 disabled:text-slate-400 disabled:hover:bg-transparent"
            >
              Mark all read
            </button>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {status === "loading" && <p className="p-4 text-sm text-slate-500">Loading…</p>}
            {status === "error" && (
              <p className="p-4 text-sm text-slate-600">
                Couldn’t load notifications.{" "}
                <button type="button" onClick={reload} className="font-medium text-orange-700 underline">
                  Try again
                </button>
              </p>
            )}
            {status === "ready" && recent.length === 0 && <p className="p-4 text-sm text-slate-500">You’re all caught up.</p>}
            {status === "ready" && recent.length > 0 && (
              <NotificationList
                compact
                items={recent}
                onOpen={(n) => {
                  if (!n.readAt) markRead([n.id]);
                  setOpen(false);
                }}
              />
            )}
          </div>
          {allHref && (
            <Link
              href={allHref}
              onClick={() => setOpen(false)}
              className="block border-t border-slate-200 px-3 py-2 text-center text-sm font-medium text-orange-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-orange-600"
            >
              See all notifications
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
