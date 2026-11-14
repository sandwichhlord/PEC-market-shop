"use client";

import { ErrorState } from "@/components/ui/ErrorState";

export default function ShopProfileError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorState title="Couldn’t load your shop profile" onRetry={reset} />;
}
