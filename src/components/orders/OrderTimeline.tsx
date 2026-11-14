import { formatDateTime } from "@/lib/datetime";
import { ORDER_STATUS_LABEL } from "@/lib/order-status";
import type { CustomerOrderDetail } from "@/server/orders/history";

type TimelineEvent = CustomerOrderDetail["events"][number];

/** Who made a change, as the customer sees it (system changes such as payment confirmations show no actor). */
function actorLabel(event: TimelineEvent, shopName: string): string | null {
  if (!event.actor) return null;
  if (event.actor.role === "CUSTOMER") return "You";
  if (event.actor.role === "SHOP_OWNER") return shopName;
  return "PEC Market admin";
}

/** Every status change of the order (its OrderEvent rows), oldest first. */
export function OrderTimeline({ events, shopName }: { events: TimelineEvent[]; shopName: string }) {
  return (
    <section aria-labelledby="timeline-heading" className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 id="timeline-heading" className="mb-3 font-semibold text-slate-900">
        Status history
      </h2>
      <ol data-testid="order-timeline" className="space-y-3 border-l border-slate-200 pl-4 text-sm">
        {events.map((e) => {
          const actor = actorLabel(e, shopName);
          return (
            <li key={e.id} data-status={e.toStatus} className="relative">
              <span aria-hidden="true" className="absolute top-1.5 -left-[21px] size-2.5 rounded-full bg-slate-400" />
              <p className="font-medium text-slate-900">{e.fromStatus === null ? "Order created" : ORDER_STATUS_LABEL[e.toStatus]}</p>
              <p className="text-xs text-slate-500">
                <time dateTime={e.createdAt.toISOString()}>{formatDateTime(e.createdAt)}</time>
                {actor && <> · {actor}</>}
              </p>
              {e.note && <p className="mt-0.5 whitespace-pre-line text-slate-600">{e.note}</p>}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
