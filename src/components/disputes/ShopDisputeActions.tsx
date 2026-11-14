"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { TextArea } from "@/components/ui/TextField";
import { fieldError, postJson, type ApiError } from "@/lib/api-client";
import { formatPaise } from "@/lib/money";
import type { DisputeAction } from "@/lib/validation/disputes";

interface ShopDisputeActionsProps {
  shopId: string;
  complaintId: string;
  type: "REFUND" | "COMPLAINT";
  refundAmountPaise: number | null;
}

type Mode = "reject" | "reply" | "resolve" | null;

/**
 * The shop's answer to an open dispute (SPEC §6). Refund request: approve (refund issued at once) or reject with a
 * reason (goes to the admin). Complaint: reply, or mark resolved with an optional note.
 */
export function ShopDisputeActions({ shopId, complaintId, type, refundAmountPaise }: ShopDisputeActionsProps) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(null);
  const [text, setText] = useState("");
  const [pending, setPending] = useState<DisputeAction["action"] | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  async function send(action: DisputeAction) {
    setPending(action.action);
    setError(null);
    const result = await postJson(`/api/shops/${shopId}/disputes/${complaintId}`, action);
    setPending(null);
    if (!result.ok) {
      setError(result.error);
      if (result.error.code !== "VALIDATION_ERROR") router.refresh();
      return;
    }
    setMode(null);
    setText("");
    router.refresh();
  }

  const open = (m: Mode) => {
    setMode(m);
    setText("");
    setError(null);
  };

  const textError = fieldError(error, "reason") ?? fieldError(error, "message") ?? fieldError(error, "resolution");

  return (
    <div className="mt-3 space-y-3 border-t border-slate-200 pt-3">
      {mode === null && (
        <div className="flex flex-wrap gap-2">
          {type === "REFUND" ? (
            <>
              <Button onClick={() => send({ action: "approve" })} loading={pending === "approve"}>
                Approve refund{refundAmountPaise !== null && ` (${formatPaise(refundAmountPaise)})`}
              </Button>
              <Button variant="secondary" onClick={() => open("reject")}>
                Reject
              </Button>
            </>
          ) : (
            <>
              <Button variant="secondary" onClick={() => open("reply")}>
                Reply
              </Button>
              <Button onClick={() => open("resolve")}>Mark resolved</Button>
            </>
          )}
        </div>
      )}
      {mode !== null && (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (mode === "reject") void send({ action: "reject", reason: text });
            else if (mode === "reply") void send({ action: "reply", message: text });
            else void send({ action: "resolve", resolution: text.trim() || undefined });
          }}
        >
          <TextArea
            label={mode === "reject" ? "Reason for rejecting (the customer and the admin will see it)" : mode === "reply" ? "Your reply" : "Resolution note (optional)"}
            rows={3}
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={mode === "reject" ? 500 : 1000}
            error={textError}
          />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant={mode === "reject" ? "danger" : "primary"} loading={pending !== null}>
              {mode === "reject" ? "Reject refund" : mode === "reply" ? "Send reply" : "Mark resolved"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => open(null)}>
              Cancel
            </Button>
          </div>
        </form>
      )}
      {error && !textError && <Alert tone="error">{error.message}</Alert>}
    </div>
  );
}
