"use client";

import { Bell, X } from "lucide-react";
import Link from "next/link";

export interface Toast {
  id: string;
  title: string;
  body: string;
  link: string | null;
}

/** Live notification toasts, stacked above the mobile tab bar. Announced politely to screen readers. */
export function Toaster({ toasts, onDismiss, onOpen }: { toasts: Toast[]; onDismiss: (id: string) => void; onOpen: (id: string) => void }) {
  return (
    <div
      aria-live="polite"
      aria-label="Live updates"
      role="region"
      className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4 md:right-4 md:bottom-4 md:left-auto md:items-end"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          data-testid="toast"
          className="pointer-events-auto flex w-full max-w-sm gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-lg"
        >
          <Bell aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-orange-600" />
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-semibold text-slate-900">{t.title}</p>
            <p className="text-slate-600">{t.body}</p>
            {t.link && (
              <Link
                href={t.link}
                onClick={() => {
                  onOpen(t.id);
                  onDismiss(t.id);
                }}
                className="mt-1 inline-block font-medium text-orange-700 hover:underline focus-visible:outline-2 focus-visible:outline-orange-600"
              >
                View
              </Link>
            )}
          </div>
          <button
            type="button"
            onClick={() => onDismiss(t.id)}
            aria-label="Dismiss notification"
            className="-m-1 self-start rounded-md p-1 text-slate-500 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-orange-600"
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
