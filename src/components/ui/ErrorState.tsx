"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "./Button";

/** Shown by route error boundaries: a message plus a retry button. */
export function ErrorState({ title = "Something went wrong", message, onRetry }: { title?: string; message?: string; onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 rounded-xl border border-red-200 bg-white px-6 py-10 text-center">
      <AlertTriangle aria-hidden="true" className="size-8 text-red-500" />
      <p className="font-medium text-slate-800">{title}</p>
      <p className="text-sm text-slate-500">{message ?? "We couldn’t load this page. Check your connection and try again."}</p>
      <Button variant="secondary" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}
