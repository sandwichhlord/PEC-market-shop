"use client";

import { X } from "lucide-react";
import { useEffect, useRef } from "react";

interface SheetProps {
  open: boolean;
  onClose: () => void;
  /** Accessible name of the dialog. */
  title: string;
  /** Visually hide the title (when the content already shows it prominently). */
  hideTitle?: boolean;
  children: React.ReactNode;
}

/**
 * Modal built on the native <dialog> (focus trap, Esc, inert background for free): a bottom sheet on mobile and a
 * centred card from `sm` up. Clicking the backdrop closes it.
 */
export function Sheet({ open, onClose, title, hideTitle = false, children }: SheetProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-label={title}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="m-0 mt-auto max-h-[90dvh] w-full max-w-none overflow-hidden rounded-t-2xl bg-white p-0 text-slate-900 shadow-xl backdrop:bg-slate-900/50 sm:m-auto sm:max-w-md sm:rounded-2xl"
    >
      {open && (
        <div className="flex max-h-[90dvh] flex-col">
          <div className="flex items-center justify-between gap-3 px-4 pt-3">
            {/* The dialog is already named by aria-label; a hidden title would only duplicate the content's heading. */}
            {!hideTitle && <h2 className="text-lg font-semibold">{title}</h2>}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="ml-auto rounded-full p-2 text-slate-500 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-orange-600"
            >
              <X aria-hidden="true" className="size-5" />
            </button>
          </div>
          <div className="overflow-y-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">{children}</div>
        </div>
      )}
    </dialog>
  );
}
