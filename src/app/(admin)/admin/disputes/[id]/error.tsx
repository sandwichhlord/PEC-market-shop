"use client";

import { ErrorState } from "@/components/ui/ErrorState";

export default function AdminDisputesDetailError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorState title="Couldn’t load the dispute" onRetry={reset} />;
}
