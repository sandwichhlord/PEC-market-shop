"use client";

import { ErrorState } from "@/components/ui/ErrorState";

export default function AdminReportsError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorState title="Couldn’t load reports" onRetry={reset} />;
}
