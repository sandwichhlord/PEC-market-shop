import { UtensilsCrossed } from "lucide-react";
import Link from "next/link";

export function BrandMark({ href = "/", subtitle }: { href?: string; subtitle?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2 rounded-md focus-visible:outline-2 focus-visible:outline-orange-600">
      <span className="rounded-lg bg-orange-100 p-1.5 text-orange-600">
        <UtensilsCrossed aria-hidden="true" className="size-5" />
      </span>
      <span className="leading-tight">
        <span className="block font-bold tracking-tight text-slate-900">PEC Market</span>
        {subtitle && <span className="block text-xs text-slate-500">{subtitle}</span>}
      </span>
    </Link>
  );
}
