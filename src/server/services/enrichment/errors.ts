import "server-only";

type EnrichmentErrorCode =
  | "INVALID_INPUT"
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "STALE"
  | "CONFLICT"
  | "IN_PROGRESS"
  | "RATE_LIMITED"
  | "NOT_CONFIGURED"
  | "CANCELLED"
  | "TIMEOUT"
  | "UNAVAILABLE";
export class EnrichmentError extends Error {
  constructor(readonly code: EnrichmentErrorCode) {
    super(
      {
        INVALID_INPUT: "Check the enrichment choices and review them again.",
        NOT_FOUND: "This enrichment record is unavailable.",
        FORBIDDEN: "This enrichment operation is not permitted.",
        STALE:
          "The target or review changed. Start a new review; your catalog was not changed.",
        CONFLICT:
          "The catalog changed since this review. Start a new reviewed run.",
        IN_PROGRESS: "An enrichment request is already running.",
        RATE_LIMITED: "The enrichment limit has been reached. Try again later.",
        NOT_CONFIGURED: "Metadata lookup is not configured.",
        CANCELLED: "Enrichment was cancelled.",
        TIMEOUT: "Enrichment timed out. Check its status before retrying.",
        UNAVAILABLE:
          "Enrichment is unavailable. Check its status before retrying.",
      }[code],
    );
  }
}
