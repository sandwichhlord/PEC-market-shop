"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { useSocket, type RealtimeHandlers } from "@/lib/realtime/client";
import type { Subscription } from "@/lib/realtime/protocol";
import type { RealtimeEventName } from "@/server/realtime/emit";

interface LiveRefreshProps {
  /** Events that make the server-rendered page stale. */
  on: Exclude<RealtimeEventName, "notification:new">[];
  /** Only react to events about this order / this shop. */
  orderId?: string;
  shopId?: string;
  /** A room to listen to while the page is open. */
  subscribe?: Subscription;
}

/**
 * Re-renders the current server page (router.refresh) when a matching real-time event arrives, and after the
 * connection comes back (anything could have changed while offline). Bursts of events cause a single refresh.
 */
export function LiveRefresh({ on, orderId, shopId, subscribe }: LiveRefreshProps) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const refresh = () => {
    if (timer.current) return;
    timer.current = setTimeout(() => {
      timer.current = null;
      router.refresh();
    }, 50);
  };

  const matches = (event: { shopId: string; orderId?: string }) =>
    (!orderId || event.orderId === orderId) && (!shopId || event.shopId === shopId);

  const events: RealtimeHandlers = {};
  for (const name of on) {
    events[name] = (event: { shopId: string; orderId?: string }) => {
      if (matches(event)) refresh();
    };
  }
  useSocket({ events, subscribe, onReconnect: refresh });
  return null;
}
