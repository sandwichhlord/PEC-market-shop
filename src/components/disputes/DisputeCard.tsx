import type { ComplaintStatus, ComplaintType } from "@/generated/prisma/enums";
import { formatDateTime } from "@/lib/datetime";
import { formatPaise } from "@/lib/money";
import { COMPLAINT_STATUS_LABEL, COMPLAINT_TYPE_LABEL } from "@/lib/order-status";

export interface DisputeView {
  id: string;
  type: ComplaintType;
  status: ComplaintStatus;
  description: string;
  itemIds: string[];
  refundAmountPaise: number | null;
  shopResponse: string | null;
  resolution: string | null;
  createdAt: Date;
}

const STATUS_TONE: Record<ComplaintStatus, string> = {
  OPEN: "bg-orange-100 text-orange-800",
  ESCALATED: "bg-rose-100 text-rose-800",
  RESOLVED: "bg-teal-100 text-teal-800",
  REJECTED: "bg-slate-200 text-slate-700",
};

/**
 * One refund request or complaint: what was asked (items + amount), why, and the answers so far. `viewer` words the
 * shop's reply ("Your response" for the shop, "Shop's response" for the customer). `children` holds actions.
 */
export function DisputeCard({
  dispute,
  items,
  viewer,
  children,
}: {
  dispute: DisputeView;
  items: { id: string; nameAtOrder: string; quantity: number }[];
  viewer: "customer" | "shop";
  children?: React.ReactNode;
}) {
  const requested = items.filter((i) => dispute.itemIds.includes(i.id));
  return (
    <li data-testid="dispute" data-type={dispute.type} data-dispute-status={dispute.status} className="rounded-lg bg-slate-50 p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium text-slate-900">
          {COMPLAINT_TYPE_LABEL[dispute.type]}
          {dispute.refundAmountPaise !== null && <> · {formatPaise(dispute.refundAmountPaise)}</>}
        </p>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_TONE[dispute.status]}`}>
          {COMPLAINT_STATUS_LABEL[dispute.status]}
        </span>
      </div>
      <p className="text-xs text-slate-500">
        <time dateTime={dispute.createdAt.toISOString()}>{formatDateTime(dispute.createdAt)}</time>
      </p>
      {requested.length > 0 && (
        <p className="mt-1 text-slate-700">Items: {requested.map((i) => `${i.quantity}× ${i.nameAtOrder}`).join(", ")}</p>
      )}
      <p className="mt-1 whitespace-pre-line text-slate-700">{dispute.description}</p>
      {dispute.shopResponse && (
        <p className="mt-2 whitespace-pre-line text-slate-700">
          <span className="font-medium">{viewer === "shop" ? "Your response" : "Shop’s response"}:</span> {dispute.shopResponse}
        </p>
      )}
      {dispute.resolution && (
        <p className="mt-1 whitespace-pre-line text-slate-700">
          <span className="font-medium">Resolution:</span> {dispute.resolution}
        </p>
      )}
      {children}
    </li>
  );
}
