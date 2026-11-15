"use client";

import { ErrorState } from "@/components/ui/ErrorState";

/** Fallback boundary for customer pages that have no boundary of their own. */
export default function CustomerError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorState onRetry={reset} />;
}
