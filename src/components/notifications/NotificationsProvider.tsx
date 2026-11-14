"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { closeSocket, useSocket } from "@/lib/realtime/client";
import type { NotificationEvent } from "@/server/realtime/emit";
import { Toaster, type Toast } from "./Toaster";

export type NotificationItem = Omit<NotificationEvent["notification"], "readAt"> & { readAt: string | null };

interface NotificationsState {
  items: NotificationItem[];
  unreadCount: number;
  status: "loading" | "ready" | "error";
  reload: () => void;
  markRead: (ids: string[]) => void;
  markAllRead: () => void;
}

const NotificationsContext = createContext<NotificationsState | null>(null);

export function useNotifications(): NotificationsState {
  const value = useContext(NotificationsContext);
  if (!value) throw new Error("useNotifications must be used inside <NotificationsProvider>.");
  return value;
}

const TOAST_MS = 6000;

/** keepalive: a click that also navigates (or a reload) must not cancel the request. */
const postRead = (body: { ids: string[] } | { all: true }) =>
  apiFetch<{ unreadCount: number }>("/api/notifications/read", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    keepalive: true,
  });

/**
 * Per-portal notification state: the list and unread count (loaded from the API, refetched after a reconnect), live
 * additions from `notification:new` events, and a toast for each one. Also owns the tab's socket lifetime: leaving
 * the portal (logout) closes it.
 */
export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [status, setStatus] = useState<NotificationsState["status"]>("loading");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  /** Ids already in the list, so a notification that arrives both live and via a reload is shown once. */
  const seen = useRef(new Set<string>());

  const reload = useCallback(async () => {
    const result = await apiFetch<{ notifications: NotificationItem[]; unreadCount: number }>("/api/notifications");
    if (result.ok) {
      for (const n of result.data.notifications) seen.current.add(n.id);
      setItems(result.data.notifications);
      setUnreadCount(result.data.unreadCount);
      setStatus("ready");
    } else {
      setStatus((s) => (s === "ready" ? s : "error"));
    }
  }, []);

  useEffect(() => {
    // Initial load of server data into client state; setState happens after the fetch resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reload() only sets state asynchronously
    void reload();
  }, [reload]);

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const t of pending.values()) clearTimeout(t);
      closeSocket();
    };
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts((list) => list.filter((t) => t.id !== id));
    const t = timers.current.get(id);
    if (t) clearTimeout(t);
    timers.current.delete(id);
  }, []);

  useSocket({
    events: {
      "notification:new": ({ notification }) => {
        if (seen.current.has(notification.id)) return;
        seen.current.add(notification.id);
        setItems((list) => [notification, ...list].slice(0, 50));
        setUnreadCount((c) => c + 1);
        setToasts((list) => [...list.slice(-2), { id: notification.id, title: notification.title, body: notification.body, link: notification.link }]);
        timers.current.set(notification.id, setTimeout(() => dismiss(notification.id), TOAST_MS));
      },
    },
    onReconnect: () => void reload(),
  });

  const markRead = useCallback(
    (ids: string[]) => {
      const now = new Date().toISOString();
      const unread = new Set(ids);
      setItems((list) => list.map((n) => (unread.has(n.id) && !n.readAt ? { ...n, readAt: now } : n)));
      void postRead({ ids }).then((r) => {
        if (r.ok) setUnreadCount(r.data.unreadCount);
      });
    },
    [],
  );

  const markAllRead = useCallback(() => {
    const now = new Date().toISOString();
    setItems((list) => list.map((n) => (n.readAt ? n : { ...n, readAt: now })));
    setUnreadCount(0);
    void postRead({ all: true }).then((r) => {
      if (r.ok) setUnreadCount(r.data.unreadCount);
    });
  }, []);

  const value = useMemo<NotificationsState>(
    () => ({ items, unreadCount, status, reload: () => void reload(), markRead, markAllRead }),
    [items, unreadCount, status, reload, markRead, markAllRead],
  );

  return (
    <NotificationsContext.Provider value={value}>
      {children}
      <Toaster toasts={toasts} onDismiss={dismiss} onOpen={(id) => markRead([id])} />
    </NotificationsContext.Provider>
  );
}
