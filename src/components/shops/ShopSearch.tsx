"use client";

import { Search } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

/**
 * Search-by-name box for the shops list. Updates `?q=` as the user types (debounced) so results are server-rendered
 * and shareable; it is also a plain GET form, so it works before hydration.
 */
export function ShopSearch({ initialQuery }: { initialQuery: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [value, setValue] = useState(initialQuery);
  const [pending, startTransition] = useTransition();
  const lastPushed = useRef(initialQuery);

  useEffect(() => {
    const q = value.trim();
    if (q === lastPushed.current) return;
    const timer = setTimeout(() => {
      lastPushed.current = q;
      startTransition(() => router.replace(q ? `${pathname}?q=${encodeURIComponent(q)}` : pathname, { scroll: false }));
    }, 250);
    return () => clearTimeout(timer);
  }, [value, pathname, router]);

  return (
    <form role="search" action={pathname} method="get" className="mb-4" onSubmit={(e) => e.preventDefault()}>
      <label htmlFor="shop-search" className="sr-only">
        Search shops by name
      </label>
      <div className="relative">
        <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
        <input
          id="shop-search"
          name="q"
          type="search"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Search shops"
          maxLength={80}
          autoComplete="off"
          aria-busy={pending}
          className="block w-full rounded-lg border border-slate-300 bg-white py-2.5 pr-3 pl-9 text-base text-slate-900 placeholder:text-slate-400 focus:outline-2 focus:outline-offset-0 focus:outline-orange-600 sm:text-sm"
        />
      </div>
    </form>
  );
}
