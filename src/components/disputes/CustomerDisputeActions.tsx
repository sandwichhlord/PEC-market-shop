"use client";

import { MessageSquareWarning, Undo2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { TextArea } from "@/components/ui/TextField";
import { fieldError, postJson, type ApiError } from "@/lib/api-client";
import { formatPaise } from "@/lib/money";

interface RefundableItem {
  id: string;
  nameAtOrder: string;
  quantity: number;
  pricePaiseAtOrder: number;
}

interface CustomerDisputeActionsProps {
  orderId: string;
  /** Items not refunded yet; refunds are offered only when the order may still be refunded and some are left. */
  refundableItems: RefundableItem[];
  canRequestRefund: boolean;
  canComplain: boolean;
}

/** "Request a refund" and "Report a problem" buttons with their forms (SPEC §6). */
export function CustomerDisputeActions({ orderId, refundableItems, canRequestRefund, canComplain }: CustomerDisputeActionsProps) {
  const router = useRouter();
  const [open, setOpen] = useState<"refund" | "complaint" | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const showRefund = canRequestRefund && refundableItems.length > 0;
  if (!showRefund && !canComplain) return null;

  const allSelected = refundableItems.length > 0 && selected.size === refundableItems.length;
  const amount = refundableItems.filter((i) => selected.has(i.id)).reduce((sum, i) => sum + i.pricePaiseAtOrder * i.quantity, 0);

  function openForm(kind: "refund" | "complaint") {
    setSelected(new Set());
    setText("");
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
    const result =
      open === "refund"
        ? await postJson(`/api/orders/${orderId}/refund-request`, allSelected ? { wholeOrder: true, reason: text } : { itemIds: [...selected], reason: text })
        : await postJson(`/api/orders/${orderId}/complaints`, { description: text });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setOpen(null);
    router.refresh();
  }

  return (
    <div className="flex flex-wrap gap-2">
      {showRefund && (
        <Button variant="secondary" onClick={() => openForm("refund")}>
          <Undo2 aria-hidden="true" className="size-4" />
          Request a refund
        </Button>
      )}
      {canComplain && (
        <Button variant="ghost" onClick={() => openForm("complaint")}>
          <MessageSquareWarning aria-hidden="true" className="size-4" />
          Report a problem
        </Button>
      )}

      <Sheet open={open !== null} onClose={() => setOpen(null)} title={open === "refund" ? "Request a refund" : "Report a problem"}>
        <form onSubmit={submit} className="space-y-4 pt-2 pb-2" noValidate>
          {open === "refund" ? (
            <>
              <fieldset className="space-y-2">
                <legend className="mb-1 text-sm font-medium text-slate-700">Which items should be refunded?</legend>
                <label className="flex min-h-11 items-center gap-3 rounded-lg border border-slate-200 px-3 text-sm font-medium">
                  <input
                    type="checkbox"
                    className="size-4 accent-orange-600"
                    checked={allSelected}
                    onChange={() => setSelected(allSelected ? new Set() : new Set(refundableItems.map((i) => i.id)))}
                  />
                  Whole order
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
                <span className="tabular-nums" data-testid="refund-amount">
                  {formatPaise(amount)}
                </span>
              </p>
              <TextArea
                label="Reason"
                rows={3}
                value={text}
                onChange={(e) => setText(e.target.value)}
                maxLength={500}
                placeholder="e.g. The shop said this item is unavailable."
                error={fieldError(error, "reason")}
              />
            </>
          ) : (
            <TextArea
              label="What went wrong?"
              rows={4}
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={1000}
              error={fieldError(error, "description")}
            />
          )}
          {error && !error.fieldErrors && <Alert tone="error">{error.message}</Alert>}
          <Button type="submit" loading={pending} className="w-full" disabled={open === "refund" && selected.size === 0}>
            {open === "refund" ? `Request ${formatPaise(amount)} refund` : "Send complaint"}
          </Button>
        </form>
      </Sheet>
    </div>
  );
}
