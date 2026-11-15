import { SearchX } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/ui/EmptyState";

/** 404 for any unknown URL. */
export default function NotFound() {
  return (
    <main className="mx-auto max-w-md px-4 py-16">
      <EmptyState icon={SearchX} title="Page not found">
        The link may be old or mistyped.{" "}
        <Link href="/" className="font-medium text-orange-700 underline-offset-2 hover:underline">
          Go to PEC Market
        </Link>
      </EmptyState>
    </main>
  );
}
