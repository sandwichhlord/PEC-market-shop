// Uniform error handling for API route handlers. Every error response is `{ error: { code, message, ... } }`.
import { NextResponse } from "next/server";
import { ZodError, z } from "zod";
import { OrderTransitionError } from "@/lib/order-state";
import { clearSessionCookie } from "@/server/auth/session";
import { PaymentConfigError } from "@/server/payments/errors";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export const unauthorized = (message = "Please log in to continue.") => new HttpError(401, "UNAUTHENTICATED", message);
export const forbidden = (message = "You do not have access to this.") => new HttpError(403, "FORBIDDEN", message);
export const notFound = (message = "Not found.") => new HttpError(404, "NOT_FOUND", message);
export const badRequest = (message: string, extra: Record<string, unknown> = {}) =>
  new HttpError(400, "BAD_REQUEST", message, extra);

export interface ErrorBody {
  error: { code: string; message: string; fieldErrors?: Record<string, string[] | undefined> } & Record<string, unknown>;
}

export function errorResponse(err: unknown): NextResponse<ErrorBody> {
  if (err instanceof HttpError) {
    const { clearSession, ...extra } = err.extra;
    const res = NextResponse.json({ error: { code: err.code, message: err.message, ...extra } }, { status: err.status });
    // Stale or suspended sessions are logged out on the spot.
    if (clearSession === true) clearSessionCookie(res);
    if (typeof extra.retryAfterSeconds === "number") res.headers.set("Retry-After", String(extra.retryAfterSeconds));
    return res;
  }
  if (err instanceof ZodError) {
    const fieldErrors = z.flattenError(err).fieldErrors as Record<string, string[] | undefined>;
    const first = err.issues[0]?.message ?? "Invalid input.";
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: first, fieldErrors } }, { status: 400 });
  }
  if (err instanceof OrderTransitionError) {
    return NextResponse.json(
      { error: { code: err.httpStatus === 403 ? "FORBIDDEN_TRANSITION" : "INVALID_TRANSITION", message: err.message } },
      { status: err.httpStatus },
    );
  }
  if (err instanceof PaymentConfigError) {
    console.error("[api] payments misconfigured:", err.message);
    return NextResponse.json(
      { error: { code: "PAYMENTS_UNAVAILABLE", message: "Online payment is not available right now. Please try again later." } },
      { status: 503 },
    );
  }
  console.error("[api] unhandled error", err);
  return NextResponse.json({ error: { code: "INTERNAL", message: "Something went wrong. Please try again." } }, { status: 500 });
}

/** Wraps a route handler so thrown HttpError / ZodError / transition errors become JSON responses. */
export function withErrors<A extends unknown[]>(
  handler: (...args: A) => Promise<Response>,
): (...args: A) => Promise<Response> {
  return async (...args: A) => {
    try {
      return await handler(...args);
    } catch (err) {
      return errorResponse(err);
    }
  };
}

/** Parses a JSON body, turning malformed JSON into a 400 instead of a 500. */
export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw badRequest("Request body must be valid JSON.");
  }
}

/** The text fields `names` present in a form (absent or file-valued fields are left out, so zod sees them as missing). */
export function formStrings<K extends string>(form: FormData, names: readonly K[]): Partial<Record<K, string>> {
  const out: Partial<Record<K, string>> = {};
  for (const name of names) {
    const value = form.get(name);
    if (typeof value === "string") out[name] = value;
  }
  return out;
}

/** Multipart overhead allowance on top of the file bytes a form may carry (field values, part headers). */
export const FORM_OVERHEAD_BYTES = 64 * 1024;

/**
 * Reads a request body into memory, refusing it with 413 as soon as more than `maxBytes` arrive — so an
 * oversized or chunked upload without a Content-Length is never fully buffered.
 */
async function readCapped(req: Request, maxBytes: number, tooLarge: () => HttpError): Promise<Uint8Array<ArrayBuffer>> {
  const declared = req.headers.get("content-length");
  if (declared !== null && Number(declared) > maxBytes) throw tooLarge();
  if (!req.body) return new Uint8Array(0);
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw tooLarge();
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

/**
 * Parses a multipart/urlencoded body of at most `maxBytes` (default: one 5 MB image plus overhead), turning malformed
 * bodies into a 400 and oversized ones into a 413 IMAGE_TOO_LARGE on `field`.
 */
export async function readForm(
  req: Request,
  {
    maxBytes = MAX_FORM_BYTES,
    field = "file",
    message = "Images must be 5 MB or smaller.",
  }: { maxBytes?: number; field?: string; message?: string } = {},
): Promise<FormData> {
  const bytes = await readCapped(req, maxBytes, () => new HttpError(413, "IMAGE_TOO_LARGE", message, { field }));
  try {
    return await new Response(bytes, { headers: { "content-type": req.headers.get("content-type") ?? "" } }).formData();
  } catch {
    throw badRequest("Request body must be multipart form data.");
  }
}

/** Default cap for `readForm`: one image of the 5 MB upload limit plus the multipart allowance. */
const MAX_FORM_BYTES = 5 * 1024 * 1024 + FORM_OVERHEAD_BYTES;
