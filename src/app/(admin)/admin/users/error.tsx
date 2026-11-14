"use client";

import { ErrorState } from "@/components/ui/ErrorState";

export default function AdminUsersError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorState title="Couldn’t load users" onRetry={reset} />;
}
