"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { postJson, type ApiError } from "@/lib/api-client";
import { formatPaise } from "@/lib/money";

/** "Pay" and "Fail" on the mock payment page (stands in for Stripe Checkout in tests and keyless setups). */
export function MockPaymentButtons({ orderId, totalPaise }: { orderId: string; totalPaise: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"pay" | "fail" | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  const submit = async (action: "pay" | "fail") => {
    setBusy(action);
    setError(null);
    const result = await postJson<{ redirectTo: string }>(`/api/payments/mock/${encodeURIComponent(orderId)}`, { action });
    if (result.ok) {
      router.replace(result.data.redirectTo);
      return;
    }
    setBusy(null);
    setError(result.error);
  };

  return (
    <div className="space-y-3">
      {error && <Alert tone="error">{error.message}</Alert>}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button className="sm:flex-1" onClick={() => submit("pay")} loading={busy === "pay"} disabled={busy !== null}>
          Pay {formatPaise(totalPaise)}
        </Button>
        <Button
          variant="secondary"
          className="sm:flex-1"
          onClick={() => submit("fail")}
          loading={busy === "fail"}
          disabled={busy !== null}
        >
          Fail payment
        </Button>
      </div>
    </div>
  );
}
