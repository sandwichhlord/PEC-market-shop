// Uniform error handling for API route handlers. Every error response is `{ error: { code, message, ... } }`.
import { NextResponse } from "next/server";
import { ZodError, z } from "zod";
import { OrderTransitionError } from "@/lib/order-state";
import { clearSessionCookie } from "@/server/auth/session";

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

/** Parses a multipart/urlencoded body, turning malformed bodies into a 400. */
export async function readForm(req: Request): Promise<FormData> {
  try {
    return await req.formData();
  } catch {
    throw badRequest("Request body must be multipart form data.");
  }
}
