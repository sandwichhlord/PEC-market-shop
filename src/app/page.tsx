import { ShieldCheck, Store, UtensilsCrossed } from "lucide-react";
import Link from "next/link";
import { buttonClasses } from "@/components/ui/Button";

// Public landing page. Signed-in users are redirected to their portal by the proxy.
export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-6 px-6 py-10 text-center">
      <span className="rounded-full bg-orange-100 p-4 text-orange-600">
        <UtensilsCrossed aria-hidden="true" className="size-8" />
      </span>
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">PEC Market</h1>
        <p className="text-slate-600">
          Order from the shops in the PEC market, pay online, and pick up when your food is ready.
        </p>
      </div>
      <div className="flex w-full flex-col gap-3">
        <Link href="/login" className={buttonClasses("primary", "w-full")}>
          Log in to order
        </Link>
        <Link href="/signup" className={buttonClasses("secondary", "w-full")}>
          Create an account
        </Link>
      </div>
      <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-slate-600">
        <Link href="/shop/login" className="inline-flex min-h-11 items-center gap-1.5 hover:text-slate-900 hover:underline">
          <Store aria-hidden="true" className="size-4" /> Shop owners
        </Link>
        <Link href="/admin/login" className="inline-flex min-h-11 items-center gap-1.5 hover:text-slate-900 hover:underline">
          <ShieldCheck aria-hidden="true" className="size-4" /> Admin
        </Link>
      </div>
    </main>
  );
}
