/**
 * One error shape for every route: { error: { code, message, details? } }.
 *
 * `message` is written for whoever is looking at the dashboard, not for a log
 * file. Stack traces never cross the wire; they go to the logger with the
 * request id attached so a support question can still be traced.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}
