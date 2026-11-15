"use client";

import { ErrorState } from "@/components/ui/ErrorState";

/** Fallback boundary for admin portal pages that have no boundary of their own. */
export default function AdminPortalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorState onRetry={reset} />;
}
