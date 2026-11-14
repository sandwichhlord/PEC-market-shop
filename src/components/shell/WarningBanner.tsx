"use client";

import { AlertTriangle, X } from "lucide-react";
import { useSyncExternalStore } from "react";

// Dismissal is remembered per warning text in localStorage, so a new warning from the admin shows again.
const keyFor = (message: string) => `pec:dismissed-warning:${message}`;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function isDismissed(message: string): boolean {
  try {
    return window.localStorage.getItem(keyFor(message)) === "1";
  } catch {
    return false;
  }
}

export function WarningBanner({ message }: { message: string }) {
  const dismissed = useSyncExternalStore(
    subscribe,
    () => isDismissed(message),
    () => false,
  );

  if (dismissed) return null;

  function dismiss() {
    try {
      window.localStorage.setItem(keyFor(message), "1");
    } catch {
      // Storage unavailable (private mode): the banner simply comes back on the next page load.
    }
    listeners.forEach((l) => l());
  }

  return (
    <div role="alert" className="border-b border-amber-200 bg-amber-50 text-amber-900">
      <div className="mx-auto flex max-w-5xl items-start gap-3 px-4 py-3 text-sm">
        <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        <p className="flex-1">
          <span className="font-semibold">Warning from the market admin: </span>
          {message}
        </p>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss warning"
          className="-m-2 rounded-md p-2 hover:bg-amber-100 focus-visible:outline-2 focus-visible:outline-amber-700"
        >
          <X aria-hidden="true" className="size-4" />
        </button>
      </div>
    </div>
  );
}
