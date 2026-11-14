"use client";

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Accessible name, e.g. "Masala chai in stock". */
  label: string;
  disabled?: boolean;
  /** Visible text next to the switch (defaults to none). */
  children?: React.ReactNode;
}

/** On/off toggle (role="switch"). Used for stock and open/closed. */
export function Switch({ checked, onChange, label, disabled = false, children }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="inline-flex min-h-11 items-center gap-2 rounded-lg px-1 text-sm font-medium text-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600 disabled:cursor-wait disabled:opacity-60"
    >
      <span
        aria-hidden="true"
        className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors ${checked ? "bg-emerald-600" : "bg-slate-300"}`}
      >
        <span
          className={`absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform motion-reduce:transition-none ${checked ? "translate-x-5" : ""}`}
        />
      </span>
      {children}
    </button>
  );
}
