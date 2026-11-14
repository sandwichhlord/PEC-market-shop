"use client";

import { ErrorState } from "@/components/ui/ErrorState";

export default function OrdersError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorState title="Couldn’t load your orders" onRetry={reset} />;
}
