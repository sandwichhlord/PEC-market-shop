"use client";

import { ErrorState } from "@/components/ui/ErrorState";

export default function ShopsError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorState title="Couldn’t load shops" onRetry={reset} />;
}
