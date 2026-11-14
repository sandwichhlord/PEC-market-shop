import { Check, Clock } from "lucide-react";
import { formatTime } from "@/lib/datetime";
import type { ReadyEstimate, TrackingStep } from "@/lib/order-tracking";

const DOT: Record<TrackingStep["state"], string> = {
  done: "bg-emerald-600 text-white",
  current: "bg-orange-600 text-white ring-4 ring-orange-100",
  upcoming: "bg-white text-slate-400 ring-1 ring-slate-300",
};

const STATE_TEXT: Record<TrackingStep["state"], string> = { done: "(done)", current: "(current)", upcoming: "(not yet)" };

function estimateText(estimate: ReadyEstimate, now: Date): string {
  if (estimate.kind === "after-start") return `Ready about ${estimate.prepMinutes} min after the shop starts preparing.`;
  if (estimate.kind === "eta") {
    return estimate.readyAt > now
      ? `Estimated ready by ${formatTime(estimate.readyAt)} (${estimate.prepMinutes} min prep).`
      : "Should be ready any minute now.";
  }
  return `Ready for pickup since ${formatTime(estimate.readyAt)}. Show your order number at the counter.`;
}

/** Placed & paid → Preparing → Ready for pickup → Completed progress, plus the estimated ready time. */
export function OrderTracker({ steps, estimate, now }: { steps: TrackingStep[]; estimate: ReadyEstimate | null; now: Date }) {
  return (
    <section aria-labelledby="tracking-heading" className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 id="tracking-heading" className="mb-4 font-semibold text-slate-900">
        Order progress
      </h2>
      <ol className="grid grid-cols-4 gap-1" data-testid="order-progress">
        {steps.map((step, i) => (
          <li
            key={step.status}
            data-step={step.status}
            data-state={step.state}
            aria-current={step.state === "current" ? "step" : undefined}
            className="relative flex flex-col items-center text-center"
          >
            {i > 0 && (
              <span
                aria-hidden="true"
                className={`absolute top-3.5 right-1/2 h-0.5 w-full ${step.state === "upcoming" ? "bg-slate-200" : "bg-emerald-600"}`}
              />
            )}
            <span className={`relative flex size-7 items-center justify-center rounded-full text-xs font-semibold ${DOT[step.state]}`}>
              {step.state === "done" ? <Check aria-hidden="true" className="size-4" /> : i + 1}
            </span>
            <span className={`mt-2 text-xs leading-tight font-medium ${step.state === "upcoming" ? "text-slate-500" : "text-slate-900"}`}>
              {step.label}
            </span>
            {step.at && (
              <time dateTime={step.at.toISOString()} className="mt-0.5 text-[11px] text-slate-500">
                {formatTime(step.at)}
              </time>
            )}
            <span className="sr-only">{STATE_TEXT[step.state]}</span>
          </li>
        ))}
      </ol>
      {estimate && (
        <p data-testid="ready-estimate" className="mt-4 flex items-start gap-2 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
          <Clock aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-slate-500" />
          {estimateText(estimate, now)}
        </p>
      )}
    </section>
  );
}
