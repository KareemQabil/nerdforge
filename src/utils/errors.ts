/**
 * Strongly-typed error with a stable error code so callers can branch on `code`
 * instead of regexing message strings.
 */
export class NerdforgeError extends Error {
  public readonly code: string;
  public readonly details?: unknown;

  constructor(message: string, code: string, details?: unknown) {
    super(message);
    this.name = 'NerdforgeError';
    this.code = code;
    this.details = details;
  }
}

export function isNerdforgeError(e: unknown): e is NerdforgeError {
  return e instanceof NerdforgeError;
}
