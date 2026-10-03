export type ErrorCode =
  | "INVALID_INTEGER"
  | "ZERO_DENOMINATOR"
  | "INVALID_BUDGET"
  | "INVALID_SYNTAX"
  | "NOT_FOUND"
  | "BAD_REQUEST"
  | "INCOMPLETE_INPUT";

export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly status: number;

  constructor(code: ErrorCode, message: string, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export function toErrorBody(err: unknown): { status: number; body: { error: { code: ErrorCode; message: string } } } {
  if (err instanceof ApiError) {
    return { status: err.status, body: { error: { code: err.code, message: err.message } } };
  }
  const message = err instanceof Error ? err.message : String(err);
  return { status: 500, body: { error: { code: "BAD_REQUEST", message } } };
}
