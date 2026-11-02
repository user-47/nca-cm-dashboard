import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { UnauthorizedError } from "./session";

/**
 * One shape for every API error: { error: string }, where the string is
 * written for the person, not for a log file. Route handlers throw and this
 * turns the throw into the right status.
 */
export function apiError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export function apiOk<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

/**
 * Wraps a route handler so every throw becomes a response the person can read.
 * The body type is deliberately loose: a handler returns either its own shape
 * or an error shape, and pinning one generic would reject the other.
 */
export async function handle(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fn: () => Promise<NextResponse<any>>
): Promise<NextResponse> {
  try {
    return await fn();
  } catch (cause) {
    if (cause instanceof UnauthorizedError) {
      return apiError("Your session has ended. Sign in again.", 401);
    }
    if (cause instanceof ZodError) {
      const first = cause.issues[0];
      const where = first?.path.join(".");
      return apiError(
        where ? `${where}: ${first?.message}` : (first?.message ?? "That request was not valid."),
        422
      );
    }
    console.error("[api]", cause);
    return apiError(
      "Something went wrong on our side. Try again, and check the server log if it keeps happening.",
      500
    );
  }
}
