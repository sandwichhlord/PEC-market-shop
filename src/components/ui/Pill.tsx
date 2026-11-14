const TONES = {
  green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  grey: "bg-slate-100 text-slate-600 ring-slate-200",
  red: "bg-red-50 text-red-700 ring-red-200",
} as const;

/** Small neutral label (open/closed, in/out of stock). Order statuses use StatusBadge instead. */
export function Pill({ tone, children }: { tone: keyof typeof TONES; children: React.ReactNode }) {
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset ${TONES[tone]}`}>
      {children}
    </span>
  );
}
