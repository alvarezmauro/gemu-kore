import "server-only";

import type {
  ProviderContext,
  ProviderErrorCode,
  ProviderResult,
} from "./contracts";

export type Transport = (url: string, init: RequestInit) => Promise<Response>;
export type ProviderClock = {
  now: () => number;
  wallNow: () => number;
  sleep: (ms: number, signal: AbortSignal) => Promise<void>;
};

export class ProviderFailure extends Error {
  constructor(
    readonly code: ProviderErrorCode,
    readonly retryAfterSeconds?: number,
  ) {
    super(code);
  }
}

export const defaultClock: ProviderClock = {
  now: () => performance.now(),
  wallNow: () => Date.now(),
  sleep: (ms, signal) =>
    new Promise<void>((resolve, reject) => {
      signal.throwIfAborted();
      const abort = () => {
        clearTimeout(timer);
        reject(new ProviderFailure("CANCELLED"));
      };
      const timer = setTimeout(() => {
        signal.removeEventListener("abort", abort);
        resolve();
      }, ms);
      signal.addEventListener("abort", abort, { once: true });
    }),
};

export type Operation = ProviderContext & {
  dataAttempts: number;
  tokenAttempts: number;
  refreshed: boolean;
};

export function checkOperation(
  operation: ProviderContext,
  clock: ProviderClock,
) {
  if (operation.signal.aborted) throw new ProviderFailure("CANCELLED");
  if (clock.now() >= operation.deadlineAt) throw new ProviderFailure("TIMEOUT");
}

// Also races non-cooperative test transports; real fetch receives the same signal.
export async function untilAbort<T>(
  promise: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  if (signal.aborted) {
    void promise.catch(() => {});
    throw new ProviderFailure("CANCELLED");
  }
  let abort: () => void = () => {};
  const interrupted = new Promise<never>((_, reject) => {
    abort = () => reject(new ProviderFailure("CANCELLED"));
    signal.addEventListener("abort", abort, { once: true });
  });
  try {
    return await Promise.race([promise, interrupted]);
  } finally {
    signal.removeEventListener("abort", abort);
  }
}

export async function runOperation<T>(
  context: ProviderContext,
  clock: ProviderClock,
  work: (operation: Operation) => Promise<T>,
): Promise<ProviderResult<T>> {
  if (!Number.isFinite(context.deadlineAt)) return failure("INVALID_INPUT");
  if (context.signal.aborted) return failure("CANCELLED");
  const controller = new AbortController();
  const abort = () => controller.abort();
  const deadlineAt = Math.min(context.deadlineAt, clock.now() + 30000);
  const remaining = deadlineAt - clock.now();
  if (remaining <= 0) return failure("TIMEOUT");
  context.signal.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(abort, remaining);
  try {
    const operation: Operation = {
      signal: controller.signal,
      deadlineAt,
      dataAttempts: 0,
      tokenAttempts: 0,
      refreshed: false,
    };
    const data = await untilAbort(work(operation), controller.signal);
    checkOperation(operation, clock);
    return { ok: true, data };
  } catch (error) {
    if (context.signal.aborted) return failure("CANCELLED");
    if (controller.signal.aborted || clock.now() >= deadlineAt)
      return failure("TIMEOUT");
    if (error instanceof ProviderFailure)
      return failure(error.code, error.retryAfterSeconds);
    throw error;
  } finally {
    clearTimeout(timer);
    context.signal.removeEventListener("abort", abort);
  }
}

export function failure(
  code: ProviderErrorCode,
  retryAfterSeconds?: number,
): ProviderResult<never> {
  return {
    ok: false,
    error: {
      code,
      retryable: ["RATE_LIMITED", "TIMEOUT", "UNAVAILABLE"].includes(code),
      ...(retryAfterSeconds !== undefined ? { retryAfterSeconds } : {}),
    },
  };
}

type HttpResult = { status: number; data: unknown; retryAfterSeconds?: number };

function retryAfter(
  header: string | null,
  clock: ProviderClock,
): number | undefined {
  if (!header || header.length > 128) return undefined;
  const seconds = /^\d+$/.test(header)
    ? Number(header)
    : (Date.parse(header) - clock.wallNow()) / 1000;
  return Number.isFinite(seconds) && seconds >= 0
    ? Math.min(86400, Math.ceil(seconds))
    : undefined;
}

export async function requestJson(
  transport: Transport,
  clock: ProviderClock,
  operation: ProviderContext,
  url: string,
  init: RequestInit,
  maximumBytes: number,
): Promise<HttpResult> {
  checkOperation(operation, clock);
  const controller = new AbortController();
  const abort = () => controller.abort();
  operation.signal.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(
    abort,
    Math.min(8000, operation.deadlineAt - clock.now()),
  );
  let response: Response | undefined;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    response = await untilAbort(
      transport(url, {
        ...init,
        method: "POST",
        redirect: "error",
        cache: "no-store",
        signal: controller.signal,
      }),
      controller.signal,
    );
    // Fetch enforces redirects; also reject a transport returning a redirected response.
    if (
      response.redirected ||
      (response.url && response.url !== url) ||
      (response.status >= 300 && response.status < 400)
    )
      throw new ProviderFailure("INVALID_RESPONSE");
    const retryAfterSeconds = retryAfter(
      response.headers.get("retry-after"),
      clock,
    );
    if (!response.ok) {
      void response.body?.cancel().catch(() => {});
      return { status: response.status, data: null, retryAfterSeconds };
    }
    if (
      !/^application\/json(?:\s*;|$)/i.test(
        response.headers.get("content-type") ?? "",
      )
    )
      throw new ProviderFailure("INVALID_RESPONSE");
    const declared = response.headers.get("content-length");
    if (
      declared &&
      (!/^\d+$/.test(declared) || Number(declared) > maximumBytes)
    )
      throw new ProviderFailure("INVALID_RESPONSE");
    if (!response.body) throw new ProviderFailure("INVALID_RESPONSE");
    reader = response.body.getReader();
    let size = 0;
    const chunks: Uint8Array[] = [];
    while (true) {
      const part = await untilAbort(reader.read(), controller.signal);
      if (part.done) break;
      size += part.value.byteLength;
      if (size > maximumBytes) throw new ProviderFailure("INVALID_RESPONSE");
      chunks.push(part.value);
    }
    checkOperation(operation, clock);
    try {
      return {
        status: response.status,
        data: JSON.parse(Buffer.concat(chunks).toString("utf8")),
        retryAfterSeconds,
      };
    } catch {
      throw new ProviderFailure("INVALID_RESPONSE");
    }
  } catch (error) {
    checkOperation(operation, clock);
    if (controller.signal.aborted) throw new ProviderFailure("TIMEOUT");
    if (error instanceof ProviderFailure) throw error;
    throw new ProviderFailure("UNAVAILABLE");
  } finally {
    clearTimeout(timer);
    operation.signal.removeEventListener("abort", abort);
    if (reader) {
      void reader.cancel().catch(() => {});
      reader.releaseLock();
    } else if (response?.body) void response.body.cancel().catch(() => {});
  }
}

// A single provider instance shares starts/in-flight limits across its callers.
// This is intentionally a process-local limiter, not a distributed quota claim.
export class DataScheduler {
  private active = 0;
  private nextStart = 0;
  private cooldownUntil = 0;
  constructor(private readonly clock: ProviderClock) {}

  coolDown(seconds: number) {
    this.cooldownUntil = Math.max(
      this.cooldownUntil,
      this.clock.now() + seconds * 1000,
    );
  }

  async run<T>(
    operation: ProviderContext,
    request: () => Promise<T>,
  ): Promise<T> {
    while (true) {
      checkOperation(operation, this.clock);
      const wait =
        Math.max(this.nextStart, this.cooldownUntil) - this.clock.now();
      if (this.cooldownUntil >= operation.deadlineAt)
        throw new ProviderFailure(
          "RATE_LIMITED",
          Math.ceil((this.cooldownUntil - this.clock.now()) / 1000),
        );
      if (this.active < 2 && wait <= 0) break;
      await this.clock.sleep(
        Math.max(
          1,
          Math.min(
            wait > 0 ? wait : 25,
            operation.deadlineAt - this.clock.now(),
          ),
        ),
        operation.signal,
      );
    }
    this.active++;
    this.nextStart = this.clock.now() + 500;
    try {
      return await request();
    } finally {
      this.active--;
    }
  }
}
