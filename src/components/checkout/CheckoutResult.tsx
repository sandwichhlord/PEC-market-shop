import type { LucideIcon } from "lucide-react";

const TONES = {
  success: "bg-emerald-50 text-emerald-600",
  pending: "bg-sky-50 text-sky-600",
  failure: "bg-red-50 text-red-600",
} as const;

/** Headline block of the checkout success / cancel pages. */
export function CheckoutResult({
  icon: Icon,
  tone,
  title,
  children,
}: {
  icon: LucideIcon;
  tone: keyof typeof TONES;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 py-4 text-center">
      <span className={`flex size-14 items-center justify-center rounded-full ${TONES[tone]}`}>
        <Icon aria-hidden="true" className="size-7" />
      </span>
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
      <div className="max-w-md text-sm text-slate-600">{children}</div>
    </div>
  );
}
