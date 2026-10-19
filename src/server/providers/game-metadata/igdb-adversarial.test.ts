import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));

import base from "../../../../tests/fixtures/game-metadata/igdb-game.json";
import cases from "../../../../tests/fixtures/game-metadata/http-cases.json";
import type { GameFetchInput, GameSearchInput } from "./contracts";
import { createIgdbGameMetadataProvider } from "./igdb";
import type { ProviderClock, Transport } from "./http";

const selected: GameFetchInput = {
  game: { provider: "IGDB", objectType: "GAME", externalId: "42" },
};
const query = { query: "Orbit Quest", limit: 1 };
const token = {
  access_token: "fixture-access-token",
  expires_in: 3600,
  token_type: "bearer",
};
const json = (
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
type Step = {
  endpoint: "token" | "games" | "game_time_to_beats";
  response: () => Response | Promise<Response>;
};
const step = (
  endpoint: Step["endpoint"],
  body: unknown,
  status = 200,
  headers?: Record<string, string>,
): Step => ({ endpoint, response: () => json(body, status, headers) });
const auth = () => step("token", token);

function scripted(steps: Step[], onSleep?: () => void) {
  let now = 0;
  let index = 0;
  const sleeps: number[] = [];
  const clock: ProviderClock = {
    now: () => now,
    wallNow: () => Date.UTC(2026, 9, 19) + now,
    sleep: async (ms, signal) => {
      onSleep?.();
      signal.throwIfAborted();
      sleeps.push(ms);
      now += ms;
    },
  };
  const transport = vi.fn<Transport>(async (url) => {
    const next = steps[index++];
    expect(next, `Unexpected request to ${url}`).toBeDefined();
    expect(url).toBe(
      next.endpoint === "token"
        ? "https://id.twitch.tv/oauth2/token"
        : `https://api.igdb.com/v4/${next.endpoint}`,
    );
    return next.response();
  });
  return {
    provider: createIgdbGameMetadataProvider(
      { clientId: "fixture-client", clientSecret: "fixture-secret" },
      { transport, clock },
    ),
    transport,
    sleeps,
    clock,
    context: (signal = new AbortController().signal) => ({
      signal,
      deadlineAt: now + 30000,
    }),
    done: () => expect(transport).toHaveBeenCalledTimes(steps.length),
  };
}
beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("Live network is forbidden in fixture tests.");
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("IGDB adversarial request fixtures", () => {
  it.each(cases.failures)(
    "handles $label without exceeding its retry allowance",
    async ({ status, code, attempts, retryable }) => {
      const h = scripted([
        auth(),
        ...Array.from({ length: attempts }, () =>
          step("games", { error: "PRIVATE-PROVIDER-ERROR" }, status),
        ),
      ]);
      expect(await h.provider.search(query, h.context())).toEqual({
        ok: false,
        error: { code, retryable },
      });
      h.done();
    },
  );
  it.each(cases.tokens)("rejects token response: $label", async ({ input }) => {
    const h = scripted([step("token", input)]);
    expect(await h.provider.search(query, h.context())).toMatchObject({
      ok: false,
      error: { code: "INVALID_RESPONSE" },
    });
    h.done();
  });
  it.each(cases.retryAfter)(
    "honors Retry-After: $label",
    async ({ header, delay }) => {
      const h = scripted([
        auth(),
        step("games", {}, 429, { "retry-after": header }),
        step("games", []),
      ]);
      expect(await h.provider.search(query, h.context())).toMatchObject({
        ok: true,
      });
      expect(h.sleeps).toContain(delay);
      h.done();
    },
  );
  it("shares a long cooldown with the next caller without another HTTP request", async () => {
    const h = scripted([
      auth(),
      step("games", {}, 429, { "retry-after": "120" }),
    ]);
    for (let attempt = 0; attempt < 2; attempt++)
      expect(await h.provider.search(query, h.context())).toEqual({
        ok: false,
        error: {
          code: "RATE_LIMITED",
          retryable: true,
          retryAfterSeconds: 120,
        },
      });
    h.done();
  });
  it.each([401, 403, 429, 503])(
    "sanitizes token HTTP failure %s without data requests",
    async (status) => {
      const h = scripted([
        step("token", { secret: "PRIVATE-PROVIDER-ERROR" }, status),
      ]);
      const result = await h.provider.search(query, h.context());
      expect(result).toMatchObject({
        ok: false,
        error: {
          code:
            status === 429
              ? "RATE_LIMITED"
              : status === 503
                ? "UNAVAILABLE"
                : "AUTHENTICATION_FAILED",
        },
      });
      expect(JSON.stringify(result)).not.toMatch(
        /PRIVATE|fixture-secret|fixture-access-token/,
      );
      h.done();
    },
  );
  it("bounds the combined refresh and optional-endpoint retry flow", async () => {
    const h = scripted([
      auth(),
      step("games", {}, 401),
      auth(),
      step("games", [base]),
      step("game_time_to_beats", {}, 503),
      step("game_time_to_beats", {}, 503),
    ]);
    expect(await h.provider.fetch(selected, h.context())).toMatchObject({
      ok: true,
      data: { playtime: { state: "unsupported" } },
    });
    h.done();
    expect(
      h.transport.mock.calls.filter(([url]) => url.includes("oauth2")),
    ).toHaveLength(2);
    expect(
      h.transport.mock.calls.filter(([url]) => url.includes("api.igdb.com")),
    ).toHaveLength(4);
  });
  it("does not hide optional-endpoint credential failure as missing metadata", async () => {
    const h = scripted([
      auth(),
      step("games", [base]),
      step("game_time_to_beats", {}, 401),
      auth(),
      step("game_time_to_beats", {}, 403),
    ]);
    expect(await h.provider.fetch(selected, h.context())).toMatchObject({
      ok: false,
      error: { code: "AUTHENTICATION_FAILED" },
    });
    h.done();
  });
  it("checks the selected game ID before requesting any optional endpoint", async () => {
    const h = scripted([auth(), step("games", [{ ...base, id: 43 }])]);
    expect(await h.provider.fetch(selected, h.context())).toMatchObject({
      ok: false,
      error: { code: "INVALID_RESPONSE" },
    });
    h.done();
  });
  it("cancels during retry delay without another attempt", async () => {
    const abort = new AbortController();
    const h = scripted([auth(), step("games", {}, 503)], () => abort.abort());
    expect(
      await h.provider.search(query, h.context(abort.signal)),
    ).toMatchObject({ ok: false, error: { code: "CANCELLED" } });
    h.done();
  });
  it.each([
    { query: "Orbit\u0000Quest", limit: 1 },
    { query: "Orbit", limit: 1, notes: "PRIVATE" },
    { query: "Orbit", limit: 1, url: "http://127.0.0.1" },
    {
      query: "Orbit",
      limit: 1,
      platform: { provider: "OTHER", objectType: "PLATFORM", externalId: "19" },
    },
    {
      query: "Orbit",
      limit: 1,
      platform: {
        provider: "IGDB",
        objectType: "PLATFORM",
        externalId: "19",
        serialNumber: "PRIVATE",
      },
    },
  ])("rejects unexpected/private request fields before HTTP", async (input) => {
    const h = scripted([]);
    expect(
      await h.provider.search(input as GameSearchInput, h.context()),
    ).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
    h.done();
  });
  it("keeps punctuation and Unicode inside a single quoted search literal", async () => {
    const h = scripted([auth(), step("games", [])]);
    await h.provider.search(
      { query: 'ゲーム "; fields *; \\', limit: 1 },
      h.context(),
    );
    expect(h.transport.mock.calls[1][1].body).toContain(
      'search "ゲーム \\"; fields *; \\\\"; limit 1; offset 0;',
    );
    h.done();
  });
  it.each([
    { version: 2 },
    { offset: 0 },
    { offset: 1001 },
    { offset: 0.5 },
    { fingerprint: "0".repeat(64) },
    { endpoint: "http://internal.test" },
  ])("rejects forged/out-of-range cursor fields", async (change) => {
    const h = scripted([auth(), step("games", [base])]);
    const first = await h.provider.search(query, h.context());
    if (!first.ok || !first.data.nextCursor)
      throw new Error("Expected cursor fixture");
    const original = JSON.parse(
      Buffer.from(first.data.nextCursor, "base64url").toString("utf8"),
    );
    const cursor = Buffer.from(
      JSON.stringify({ ...original, ...change }),
    ).toString("base64url");
    expect(
      await h.provider.search({ ...query, cursor }, h.context()),
    ).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
    h.done();
  });
  it("stops pagination at the offset ceiling without following another page", async () => {
    const h = scripted([auth(), step("games", [base]), step("games", [base])]);
    const first = await h.provider.search(query, h.context());
    if (!first.ok || !first.data.nextCursor)
      throw new Error("Expected cursor fixture");
    const cursorData = JSON.parse(
      Buffer.from(first.data.nextCursor, "base64url").toString("utf8"),
    );
    const cursor = Buffer.from(
      JSON.stringify({ ...cursorData, offset: 1000 }),
    ).toString("base64url");
    expect(
      await h.provider.search({ ...query, cursor }, h.context()),
    ).toMatchObject({ ok: true, data: { nextCursor: null } });
    expect(h.transport.mock.calls[2][1].body).toContain("offset 1000;");
    h.done();
  });
});

describe("IGDB HTTP envelope fixtures", () => {
  it.each(["redirected", "wrong destination", "redirect status"])(
    "refuses %s responses before consuming their contents",
    async (kind) => {
      const h = scripted([
        auth(),
        {
          endpoint: "games",
          response: () => {
            const response = json([], kind === "redirect status" ? 307 : 200);
            if (kind === "redirected")
              Object.defineProperty(response, "redirected", { value: true });
            if (kind === "wrong destination")
              Object.defineProperty(response, "url", {
                value: "https://internal.test",
              });
            return response;
          },
        },
      ]);
      expect(await h.provider.search(query, h.context())).toMatchObject({
        ok: false,
        error: { code: "INVALID_RESPONSE" },
      });
      expect(h.transport.mock.calls[1][1].redirect).toBe("error");
      h.done();
    },
  );
  it.each(["-1", "infinite", "2.5", "2097153"])(
    "rejects malformed/oversized Content-Length %s",
    async (length) => {
      const h = scripted([
        auth(),
        step("games", [], 200, { "content-length": length }),
      ]);
      expect(await h.provider.search(query, h.context())).toMatchObject({
        ok: false,
        error: { code: "INVALID_RESPONSE" },
      });
      h.done();
    },
  );
  it("accepts an exact-size streamed JSON body despite an underreported length", async () => {
    const body = JSON.stringify([base]).padEnd(2 * 1024 * 1024, " ");
    const h = scripted([
      auth(),
      {
        endpoint: "games",
        response: () =>
          new Response(body, {
            headers: {
              "content-type": "application/json; charset=utf-8",
              "content-length": "0",
            },
          }),
      },
    ]);
    expect(await h.provider.search(query, h.context())).toMatchObject({
      ok: true,
    });
    h.done();
  });
  it.each(["token", "games"] as const)(
    "rejects actual streamed overflow in %s even when declared length is small",
    async (endpoint) => {
      const cancel = vi.fn();
      const maximum = endpoint === "token" ? 64 * 1024 : 2 * 1024 * 1024;
      const oversized: Step = {
        endpoint,
        response: () =>
          new Response(
            new ReadableStream({
              start(controller) {
                controller.enqueue(new Uint8Array(maximum));
                controller.enqueue(new Uint8Array(1));
              },
              cancel,
            }),
            {
              headers: {
                "content-type": "application/json",
                "content-length": "1",
              },
            },
          ),
      };
      const h = scripted(
        endpoint === "token" ? [oversized] : [auth(), oversized],
      );
      expect(await h.provider.search(query, h.context())).toMatchObject({
        ok: false,
        error: { code: "INVALID_RESPONSE" },
      });
      expect(cancel).toHaveBeenCalled();
      h.done();
    },
  );
  it("cancels while consuming a data body and releases the stream", async () => {
    const abort = new AbortController();
    const cancel = vi.fn();
    const h = scripted([
      auth(),
      {
        endpoint: "games",
        response: () =>
          new Response(
            new ReadableStream({
              pull() {
                abort.abort();
              },
              cancel,
            }),
            { headers: { "content-type": "application/json" } },
          ),
      },
    ]);
    expect(
      await h.provider.search(query, h.context(abort.signal)),
    ).toMatchObject({ ok: false, error: { code: "CANCELLED" } });
    expect(cancel).toHaveBeenCalled();
    h.done();
  });
  it.each(
    [null, { game: base }, [null], [base, base]].map((body) => ({ body })),
  )("rejects malformed search response envelopes", async ({ body }) => {
    const h = scripted([auth(), step("games", body)]);
    expect(await h.provider.search(query, h.context())).toMatchObject({
      ok: false,
      error: { code: "INVALID_RESPONSE" },
    });
    h.done();
  });
});
