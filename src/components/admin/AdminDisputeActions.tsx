"use client";

import { CheckCircle2, Undo2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { TextArea } from "@/components/ui/TextField";
import type { ComplaintType } from "@/generated/prisma/enums";
import { fieldError, postJson, type ApiError } from "@/lib/api-client";
import { formatPaise } from "@/lib/money";

interface RefundableItem {
  id: string;
  nameAtOrder: string;
  quantity: number;
  pricePaiseAtOrder: number;
}

interface AdminDisputeActionsProps {
  disputeId: string;
  type: ComplaintType;
  /** Items not refunded yet. */
  refundableItems: RefundableItem[];
  /** Items the customer asked to refund (pre-selected). */
  requestedItemIds: string[];
}

/** Force refund (chosen items or the whole remainder) and resolve-with-note for one dispute (SPEC §6). */
export function AdminDisputeActions({ disputeId, type, refundableItems, requestedItemIds }: AdminDisputeActionsProps) {
  const router = useRouter();
  const [open, setOpen] = useState<"refund" | "resolve" | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const allSelected = refundableItems.length > 0 && selected.size === refundableItems.length;
  const amount = refundableItems.filter((i) => selected.has(i.id)).reduce((sum, i) => sum + i.pricePaiseAtOrder * i.quantity, 0);

  function start(kind: "refund" | "resolve") {
    const requested = refundableItems.filter((i) => requestedItemIds.includes(i.id)).map((i) => i.id);
    setSelected(new Set(kind === "refund" ? requested : []));
    setNote("");
    setError(null);
    setOpen(kind);
  }

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const body =
      open === "refund"
        ? allSelected
          ? { action: "refund", wholeOrder: true, note }
          : { action: "refund", itemIds: [...selected], note }
        : { action: "resolve", note };
    const result = await postJson(`/api/admin/disputes/${disputeId}`, body);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setOpen(null);
    router.refresh();
  }

  const resolveLabel = type === "REFUND" ? "Close without refund" : "Resolve with note";
  return (
    <div className="flex flex-wrap gap-2">
      {refundableItems.length > 0 && (
        <Button onClick={() => start("refund")}>
          <Undo2 aria-hidden="true" className="size-4" />
          Force refund
        </Button>
      )}
      <Button variant="secondary" onClick={() => start("resolve")}>
        <CheckCircle2 aria-hidden="true" className="size-4" />
        {resolveLabel}
      </Button>

      <Sheet open={open !== null} onClose={() => setOpen(null)} title={open === "refund" ? "Force refund" : resolveLabel}>
        <form onSubmit={submit} className="space-y-4 pt-2 pb-2" noValidate>
          {open === "refund" ? (
            <>
              <fieldset className="space-y-2">
                <legend className="mb-1 text-sm font-medium text-slate-700">Items to refund</legend>
                <label className="flex min-h-11 items-center gap-3 rounded-lg border border-slate-200 px-3 text-sm font-medium">
                  <input
                    type="checkbox"
                    className="size-4 accent-orange-600"
                    checked={allSelected}
                    onChange={() => setSelected(allSelected ? new Set() : new Set(refundableItems.map((i) => i.id)))}
                  />
                  Everything not refunded yet
                </label>
                {refundableItems.map((item) => (
                  <label key={item.id} className="flex min-h-11 items-center gap-3 rounded-lg border border-slate-200 px-3 text-sm">
                    <input type="checkbox" className="size-4 accent-orange-600" checked={selected.has(item.id)} onChange={() => toggle(item.id)} />
                    <span className="min-w-0 flex-1">
                      {item.quantity}× {item.nameAtOrder}
                    </span>
                    <span className="tabular-nums text-slate-700">{formatPaise(item.pricePaiseAtOrder * item.quantity)}</span>
                  </label>
                ))}
                {fieldError(error, "itemIds") && <p className="text-sm text-red-600">{fieldError(error, "itemIds")}</p>}
              </fieldset>
              <p className="flex justify-between text-sm font-semibold text-slate-900" aria-live="polite">
                <span>Refund amount</span>
                <span className="tabular-nums" data-testid="admin-refund-amount">
                  {formatPaise(amount)}
                </span>
              </p>
            </>
          ) : (
            <p className="text-sm text-slate-600">
              {type === "REFUND"
                ? "The request is closed as rejected and no money is returned. If the order was waiting on it, it continues where it was."
                : "The complaint is closed as resolved. No money is returned."}
            </p>
          )}
          <TextArea
            label="Note to the customer and the shop"
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={1000}
            error={fieldError(error, "note")}
          />
          {error && !error.fieldErrors && <Alert tone="error">{error.message}</Alert>}
          <Button type="submit" loading={pending} className="w-full" disabled={open === "refund" && selected.size === 0}>
            {open === "refund" ? `Refund ${formatPaise(amount)}` : type === "REFUND" ? "Close request" : "Resolve complaint"}
          </Button>
        </form>
      </Sheet>
    </div>
  );
}
