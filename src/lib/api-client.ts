// Browser-side fetch helper that normalises the API's `{ error: { code, message, ... } }` responses.

export interface ApiError {
  status: number;
  code: string;
  message: string;
  fieldErrors?: Record<string, string[] | undefined>;
  [key: string]: unknown;
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiError };

export async function apiFetch<T>(url: string, init: RequestInit = {}): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await fetch(url, { credentials: "same-origin", ...init });
  } catch {
    return { ok: false, error: { status: 0, code: "NETWORK", message: "Could not reach the server. Check your connection." } };
  }
  const body: unknown = await res.json().catch(() => null);
  if (res.ok) return { ok: true, data: body as T };
  const err = (body as { error?: Partial<ApiError> } | null)?.error;
  return {
    ok: false,
    error: { ...err, status: res.status, code: err?.code ?? "HTTP_ERROR", message: err?.message ?? "Something went wrong." },
  };
}

export function postJson<T>(url: string, data: unknown): Promise<ApiResult<T>> {
  return apiFetch<T>(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
}

/** First message for a field from a validation error, if any. */
export function fieldError(error: ApiError | null, field: string): string | undefined {
  return error?.fieldErrors?.[field]?.[0];
}
