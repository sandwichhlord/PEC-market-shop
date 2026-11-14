import { UtensilsCrossed } from "lucide-react";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <span className="rounded-full bg-orange-100 p-4 text-orange-600">
        <UtensilsCrossed aria-hidden="true" className="size-8" />
      </span>
      <h1 className="text-3xl font-bold tracking-tight">PEC Market</h1>
      <p className="text-slate-600">
        Order from the shops in the PEC market, pay online, and pick up when your food is ready.
      </p>
    </main>
  );
}
