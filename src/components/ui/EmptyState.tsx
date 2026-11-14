import type { LucideIcon } from "lucide-react";

export function EmptyState({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center">
      <Icon aria-hidden="true" className="size-8 text-slate-400" />
      <p className="font-medium text-slate-800">{title}</p>
      {children && <div className="text-sm text-slate-500">{children}</div>}
    </div>
  );
}
