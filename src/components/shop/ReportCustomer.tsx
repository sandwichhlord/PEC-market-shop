"use client";

import { Flag } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { TextArea } from "@/components/ui/TextField";
import type { ReportReason } from "@/generated/prisma/enums";
import { fieldError, postJson, type ApiError } from "@/lib/api-client";
import { REPORT_REASON_LABEL } from "@/lib/reports";
import { REPORT_REASONS } from "@/lib/validation/admin";

/** "Report customer" button + form on the shop's order page (SPEC §3). The report goes to the market admin. */
export function ReportCustomer({ shopId, orderId, customerName }: { shopId: string; orderId: string; customerName: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [description, setDescription] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  function start() {
    setReason(null);
    setDescription("");
    setError(null);
    setOpen(true);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const result = await postJson(`/api/shops/${shopId}/orders/${orderId}/report`, { reason, description });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <Button variant="ghost" onClick={start} className="-ml-2 text-rose-700">
        <Flag aria-hidden="true" className="size-4" />
        Report customer
      </Button>
      <Sheet open={open} onClose={() => setOpen(false)} title={`Report ${customerName}`}>
        <form onSubmit={submit} className="space-y-4 pt-2 pb-2" noValidate>
          <p className="text-sm text-slate-600">The market admin reviews reports and may warn or suspend the customer. The customer is not told who reported them.</p>
          <fieldset className="space-y-2">
            <legend className="mb-1 text-sm font-medium text-slate-700">Reason</legend>
            {REPORT_REASONS.map((r) => (
              <label key={r} className="flex min-h-11 items-center gap-3 rounded-lg border border-slate-200 px-3 text-sm">
                <input type="radio" name="reason" value={r} checked={reason === r} onChange={() => setReason(r)} className="size-4 accent-orange-600" />
                {REPORT_REASON_LABEL[r]}
              </label>
            ))}
            {fieldError(error, "reason") && <p className="text-sm text-red-600">{fieldError(error, "reason")}</p>}
          </fieldset>
          <TextArea
            label="What happened?"
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={1000}
            error={fieldError(error, "description")}
          />
          {error && !error.fieldErrors && <Alert tone="error">{error.message}</Alert>}
          <Button type="submit" variant="danger" loading={pending} disabled={reason === null} className="w-full">
            Send report
          </Button>
        </form>
      </Sheet>
    </>
  );
}
