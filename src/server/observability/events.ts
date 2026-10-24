import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { permissions, type Permission } from "@/server/policies/permissions";

const operations = [
  "auth.request",
  "auth.access",
  "auth.revalidate",
  "auth.permission",
  "database.transaction",
  "database.connection",
  "asset.upload",
  "asset.complete",
  "asset.read",
  "enrichment.execute",
] as const;
type Operation = (typeof operations)[number];
type Outcome = "started" | "succeeded" | "denied" | "failed";
const codes = [
  "UNAUTHENTICATED",
  "DENIED",
  "FORBIDDEN",
  "REAUTHENTICATION_REQUIRED",
  "INVALID_INPUT",
  "TOO_LARGE",
  "NOT_FOUND",
  "CONFLICT",
  "BUSY",
  "UNAVAILABLE",
  "STALE",
  "COPY_STALE",
  "IN_PROGRESS",
  "RATE_LIMITED",
  "NOT_CONFIGURED",
  "CANCELLED",
  "TIMEOUT",
  "INVALID_RESPONSE",
  "AUTHENTICATION_FAILED",
  "DATABASE_QUERY_FAILED",
  "UNEXPECTED",
] as const;
type Code = (typeof codes)[number];
type Details = { uploadId?: string; runId?: string; permission?: Permission };
const scope = new AsyncLocalStorage<{
  correlationId: string;
  reported: WeakSet<object>;
  authFailure: boolean;
}>();
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function withLogContext<T>(work: () => T): T {
  return scope.getStore()
    ? work()
    : scope.run(
        {
          correlationId: randomUUID(),
          reported: new WeakSet(),
          authFailure: false,
        },
        work,
      );
}

// No messages, causes, headers or arbitrary property bags are serialized.
export function failureCode(error: unknown): Code {
  try {
    const code =
      error && typeof error === "object" && "code" in error ? error.code : null;
    if (codes.some((allowed) => allowed === code)) return code as Code;
    if (typeof code === "string" && /^P20\d\d$/.test(code))
      return "DATABASE_QUERY_FAILED";
  } catch {
    /* Untrusted getters cannot break error handling. */
  }
  return "UNEXPECTED";
}

export function operationalEvent(
  operation: Operation,
  outcome: Outcome,
  details: Details = {},
  code?: Code,
) {
  try {
    if (
      !operations.includes(operation) ||
      !["started", "succeeded", "denied", "failed"].includes(outcome)
    )
      return;
    const context = scope.getStore();
    if (operation === "auth.request" && outcome === "failed" && context) {
      if (context.authFailure) return;
      context.authFailure = true;
    }
    const event = {
      timestamp: new Date().toISOString(),
      correlationId: scope.getStore()?.correlationId ?? randomUUID(),
      operation,
      outcome,
      ...(code && codes.includes(code) ? { code } : {}),
      ...(typeof details.uploadId === "string" && uuid.test(details.uploadId)
        ? { uploadId: details.uploadId }
        : {}),
      ...(typeof details.runId === "string" && uuid.test(details.runId)
        ? { runId: details.runId }
        : {}),
      ...(permissions.includes(details.permission!)
        ? { permission: details.permission }
        : {}),
    };
    const line = JSON.stringify(event);
    if (outcome === "failed" || outcome === "denied") console.error(line);
    else console.info(line);
  } catch {
    /* Diagnostics must never change an operation's result or authority. */
  }
}

export function operationalFailure(
  operation: Operation,
  error: unknown,
  details: Details = {},
) {
  try {
    const reported = scope.getStore()?.reported;
    if (error && typeof error === "object") {
      if (reported?.has(error)) return;
      reported?.add(error);
    }
    const code = failureCode(error);
    operationalEvent(
      operation,
      [
        "UNAUTHENTICATED",
        "DENIED",
        "FORBIDDEN",
        "REAUTHENTICATION_REQUIRED",
      ].includes(code)
        ? "denied"
        : "failed",
      details,
      code,
    );
  } catch {
    /* Best effort, including hostile input getters and unavailable sinks. */
  }
}
