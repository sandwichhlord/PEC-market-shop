"use client";

import { ErrorState } from "@/components/ui/ErrorState";

/** Fallback boundary for shop portal pages that have no boundary of their own. */
export default function ShopPortalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorState onRetry={reset} />;
}
