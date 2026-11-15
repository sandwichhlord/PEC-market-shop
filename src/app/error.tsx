"use client";

import { ErrorState } from "@/components/ui/ErrorState";

/** Last-resort boundary (landing and login/signup pages). */
export default function RootError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto max-w-md px-4 py-16">
      <ErrorState onRetry={reset} />
    </main>
  );
}
