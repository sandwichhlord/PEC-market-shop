"use client";

import { ErrorState } from "@/components/ui/ErrorState";

export default function ShopOrdersError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorState title="Couldn’t load orders" onRetry={reset} />;
}
