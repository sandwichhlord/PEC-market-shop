"use client";

import { ErrorState } from "@/components/ui/ErrorState";

export default function ShopMenuError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorState title="Couldn’t load your menu" onRetry={reset} />;
}
