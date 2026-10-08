/** An error that carries the HTTP status to answer with. Kept dependency-free so pure modules can use it. */
export class HttpError extends Error {
  /** `code` is a stable, machine-readable reason (for example "terminal_limit") that other programs, such as the POS, can act on. */
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}
