"use client";

// Browser side of the real-time channel: one shared Socket.IO connection per tab (cookie-authenticated on the
// handshake), reference-counted room subscriptions that are re-sent after every reconnect, and `useSocket` for
// components. The portal shells call `closeSocket()` when they unmount (e.g. on logout), so the next user of the
// tab gets a fresh, correctly authenticated connection.
import { useEffect, useRef } from "react";
import { io, type Socket } from "socket.io-client";
import type { RealtimeEventName, RealtimeEventOf } from "@/server/realtime/emit";
import type { Subscription } from "./protocol";

let socket: Socket | null = null;
const subscriptions = new Map<string, { sub: Subscription; count: number }>();

const keyOf = (sub: Subscription) => `${sub.kind}:${sub.id}`;

function getSocket(): Socket {
  if (!socket) {
    const s = io({ path: "/socket.io", withCredentials: true });
    // Rooms are per connection on the server: ask for them again after every (re)connect.
    s.on("connect", () => {
      for (const { sub } of subscriptions.values()) s.emit("subscribe", sub);
    });
    socket = s;
  }
  return socket;
}

/** Disconnects and forgets the shared socket (portal shell unmounted, e.g. after logging out). */
export function closeSocket(): void {
  socket?.disconnect();
  socket = null;
  subscriptions.clear();
}

function subscribe(sub: Subscription): () => void {
  const s = getSocket();
  const key = keyOf(sub);
  const entry = subscriptions.get(key);
  if (entry) {
    entry.count += 1;
  } else {
    subscriptions.set(key, { sub, count: 1 });
    if (s.connected) s.emit("subscribe", sub);
  }
  return () => {
    const current = subscriptions.get(key);
    if (!current) return;
    current.count -= 1;
    if (current.count === 0) {
      subscriptions.delete(key);
      if (socket?.connected) socket.emit("unsubscribe", sub);
    }
  };
}

export type RealtimeHandlers = { [N in RealtimeEventName]?: (event: RealtimeEventOf<N>) => void };

export interface UseSocketOptions {
  /** Server events to listen to. Handlers may change between renders; the latest one is always called. */
  events?: RealtimeHandlers;
  /** A room to listen to while mounted (an order page, a shop menu). */
  subscribe?: Subscription | null;
  /** Called after the connection comes back, so the component can refetch anything it missed while offline. */
  onReconnect?: () => void;
}

/** Listens to real-time events (and optionally one room) for as long as the component is mounted. */
export function useSocket({ events = {}, subscribe: sub = null, onReconnect }: UseSocketOptions): void {
  const handlers = useRef(events);
  const reconnect = useRef(onReconnect);
  useEffect(() => {
    handlers.current = events;
    reconnect.current = onReconnect;
  });

  const names = (Object.keys(events) as RealtimeEventName[]).sort().join(",");
  useEffect(() => {
    const s = getSocket();
    const listeners = (names ? (names.split(",") as RealtimeEventName[]) : []).map((name) => {
      const listener = (payload: unknown) => {
        const handler = handlers.current[name] as ((e: unknown) => void) | undefined;
        handler?.(payload);
      };
      s.on(name, listener);
      return [name, listener] as const;
    });

    let connectedBefore = s.connected;
    const onConnect = () => {
      if (connectedBefore) reconnect.current?.();
      connectedBefore = true;
    };
    s.on("connect", onConnect);
    return () => {
      for (const [name, listener] of listeners) s.off(name, listener);
      s.off("connect", onConnect);
    };
  }, [names]);

  const subKind = sub?.kind;
  const subId = sub?.id;
  useEffect(() => {
    if (!subKind || !subId) return;
    return subscribe({ kind: subKind, id: subId });
  }, [subKind, subId]);
}
