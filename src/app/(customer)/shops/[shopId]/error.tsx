"use client";

import { ErrorState } from "@/components/ui/ErrorState";

export default function ShopError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorState title="Couldn't load this menu" onRetry={reset} />;
}
