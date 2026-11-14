"use client";

import { Ban, BellRing, RotateCcw, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { TextArea } from "@/components/ui/TextField";
import type { AccountStatus } from "@/generated/prisma/enums";
import { fieldError, postJson, type ApiError } from "@/lib/api-client";

type Action = "warn" | "suspend" | "reinstate" | "dismiss";

const TITLE: Record<Action, (name: string) => string> = {
  warn: (n) => `Warn ${n}`,
  suspend: (n) => `Suspend ${n}`,
  reinstate: (n) => `Reinstate ${n}`,
  dismiss: () => "Dismiss report",
};

const EXPLAIN: Record<Action, string> = {
  warn: "They will see this message in a banner until it is cleared, and get a notification.",
  suspend: "They are logged out on their next request and cannot log in again until reinstated. A shop owner's shop is hidden from customers.",
  reinstate: "Their account becomes active again and any warning is cleared.",
  dismiss: "The report is closed without any action against the customer.",
};

interface ModerationActionsProps {
  /** POST endpoint taking `{ action, message?, note? }` (a user or a report). */
  endpoint: string;
  /** Name of the account the actions apply to (dialog titles and button labels). */
  subjectName: string;
  status: AccountStatus;
  /** Report queue: offer Dismiss and an internal admin note. */
  report?: { dismissible: boolean };
}

/** Warn / Suspend / Reinstate (and Dismiss for reports) buttons, each confirming in a sheet. */
export function ModerationActions({ endpoint, subjectName, status, report }: ModerationActionsProps) {
  const router = useRouter();
  const [open, setOpen] = useState<Action | null>(null);
  const [message, setMessage] = useState("");
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  function start(action: Action) {
    setMessage("");
    setNote("");
    setError(null);
    setOpen(action);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!open) return;
    setPending(true);
    setError(null);
    const body: Record<string, string> = { action: open };
    if (open === "warn") body.message = message;
    if (report && note.trim()) body.note = note;
    const result = await postJson(endpoint, body);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setOpen(null);
    router.refresh();
  }

  const label = (verb: string) => `${verb} ${subjectName}`;
  return (
    <div className="flex flex-wrap gap-2">
      {status !== "SUSPENDED" && (
        <Button variant="secondary" onClick={() => start("warn")} aria-label={label("Warn")}>
          <BellRing aria-hidden="true" className="size-4" />
          Warn
        </Button>
      )}
      {status !== "SUSPENDED" && (
        <Button variant="danger" onClick={() => start("suspend")} aria-label={label("Suspend")}>
          <Ban aria-hidden="true" className="size-4" />
          Suspend
        </Button>
      )}
      {status !== "ACTIVE" && (
        <Button variant="secondary" onClick={() => start("reinstate")} aria-label={label("Reinstate")}>
          <RotateCcw aria-hidden="true" className="size-4" />
          Reinstate
        </Button>
      )}
      {report?.dismissible && (
        <Button variant="ghost" onClick={() => start("dismiss")}>
          <XCircle aria-hidden="true" className="size-4" />
          Dismiss
        </Button>
      )}

      <Sheet open={open !== null} onClose={() => setOpen(null)} title={open ? TITLE[open](subjectName) : ""}>
        {open && (
          <form onSubmit={submit} className="space-y-4 pt-2 pb-2" noValidate>
            <p className="text-sm text-slate-600">{EXPLAIN[open]}</p>
            {open === "warn" && (
              <TextArea
                label="Warning message"
                rows={3}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                maxLength={500}
                placeholder="e.g. Please collect your orders on time."
                error={fieldError(error, "message")}
              />
            )}
            {report && (
              <TextArea
                label="Admin note (optional)"
                hint="Stored on the report; not shown to the customer."
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={1000}
                error={fieldError(error, "note")}
              />
            )}
            {error && !fieldError(error, "message") && !fieldError(error, "note") && <Alert tone="error">{error.message}</Alert>}
            <Button type="submit" variant={open === "suspend" ? "danger" : "primary"} loading={pending} className="w-full">
              {open === "warn" ? "Send warning" : open === "suspend" ? "Suspend account" : open === "reinstate" ? "Reinstate account" : "Dismiss report"}
            </Button>
          </form>
        )}
      </Sheet>
    </div>
  );
}
