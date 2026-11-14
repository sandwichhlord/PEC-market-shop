"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { OrderStatus } from "@/generated/prisma/enums";
import { Button } from "@/components/ui/Button";
import { postJson } from "@/lib/api-client";
import { KITCHEN_ACTION_LABEL, nextKitchenTarget } from "@/lib/order-status";

interface KitchenActionButtonProps {
  shopId: string;
  orderId: string;
  orderNumber: string;
  status: OrderStatus;
  className?: string;
}

/** The one-tap next step for an order in the kitchen queue; renders nothing for orders with no kitchen action. */
export function KitchenActionButton({ shopId, orderId, orderNumber, status, className = "" }: KitchenActionButtonProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const target = nextKitchenTarget(status);
  if (!target) return null;

  async function run() {
    if (!target) return;
    setPending(true);
    setError(null);
    const result = await postJson(`/api/shops/${shopId}/orders/${orderId}/status`, { to: target });
    setPending(false);
    if (!result.ok) setError(result.error.message);
    // Refresh either way: on a conflict the order has moved on and the page should show its real status.
    router.refresh();
  }

  return (
    <div className={className}>
      <Button
        onClick={run}
        loading={pending}
        variant={target === "COMPLETED" ? "secondary" : "primary"}
        className="w-full sm:w-auto"
        aria-label={`${KITCHEN_ACTION_LABEL[target]} for order ${orderNumber}`}
      >
        {KITCHEN_ACTION_LABEL[target]}
      </Button>
      {error && (
        <p role="alert" className="mt-1.5 text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
