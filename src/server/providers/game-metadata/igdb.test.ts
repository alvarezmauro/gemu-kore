import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));

import fixture from "../../../../tests/fixtures/game-metadata/igdb-game.json";
import { createIgdbGameMetadataProvider } from "./igdb";
import type { GameFetchInput, GameSearchInput } from "./contracts";
import { defaultClock, type ProviderClock, type Transport } from "./http";

const credentials = { clientId: "test-client", clientSecret: "test-secret" };
const search = { query: "Orbit Quest", limit: 20 };
const selected: GameFetchInput = {
  game: { provider: "IGDB", objectType: "GAME", externalId: "42" },
};
const playtime = [
  {
    id: 99,
    game_id: 42,
    count: 20,
    hastily: 1800,
    normally: 3600,
    completely: 7201,
    updated_at: 1760000000,
  },
];
const json = (
  data: unknown,
  status = 200,
  headers: Record<string, string> = {},
) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });

function harness(
  options: {
    game?: unknown;
    time?: unknown;
    data?: (
      url: string,
      init: RequestInit,
      count: number,
    ) => Response | Promise<Response>;
    token?: (count: number) => Response | Promise<Response>;
  } = {},
) {
  let now = 0;
  let tokenCalls = 0;
  let dataCalls = 0;
  const sleeps: number[] = [];
  const starts: number[] = [];
  const clock: ProviderClock = {
    now: () => now,
    wallNow: () => Date.UTC(2026, 9, 19) + now,
    sleep: async (ms, signal) => {
      signal.throwIfAborted();
      sleeps.push(ms);
      now += ms;
    },
  };
  const transport = vi.fn<Transport>(async (url, init) => {
    if (url === "https://id.twitch.tv/oauth2/token")
      return (
        options.token?.(++tokenCalls) ??
        json({
          access_token: `token-${tokenCalls}`,
          expires_in: 3600,
          token_type: "bearer",
        })
      );
    starts.push(now);
    dataCalls++;
    return (
      options.data?.(url, init, dataCalls) ??
      json(
        url.endsWith("/games")
          ? (options.game ?? [fixture])
          : (options.time ?? playtime),
      )
    );
  });
  const provider = createIgdbGameMetadataProvider(credentials, {
    transport,
    clock,
  });
  return {
    provider,
    transport,
    clock,
    sleeps,
    starts,
    context: (signal = new AbortController().signal) => ({
      signal,
      deadlineAt: now + 30000,
    }),
    advance: (ms: number) => {
      now += ms;
    },
  };
}
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("IGDB provider boundary", () => {
  it("imports and composes the optional provider without fetching at startup", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    vi.stubEnv("IGDB_CLIENT_ID", "");
    vi.stubEnv("IGDB_CLIENT_SECRET", "");
    const { getGameMetadataProvider } = await import("./index");
    const provider = getGameMetadataProvider();
    expect(provider).toBe(getGameMetadataProvider());
    expect(
      await provider.search(search, {
        signal: new AbortController().signal,
        deadlineAt: performance.now() + 30000,
      }),
    ).toMatchObject({ ok: false, error: { code: "NOT_CONFIGURED" } });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  it("constructs without network and returns NOT_CONFIGURED on explicit lookup", async () => {
    const transport = vi.fn<Transport>();
    const provider = createIgdbGameMetadataProvider(null, { transport });
    expect(transport).not.toHaveBeenCalled();
    expect(
      await provider.search(search, {
        signal: new AbortController().signal,
        deadlineAt: performance.now() + 30000,
      }),
    ).toMatchObject({ ok: false, error: { code: "NOT_CONFIGURED" } });
    expect(transport).not.toHaveBeenCalled();
    createIgdbGameMetadataProvider(credentials, { transport });
    expect(transport).not.toHaveBeenCalled();
  });

  it("retrieves normalized evidence for each supported section without local IDs or mutations", async () => {
    const h = harness();
    const result = await h.provider.fetch(selected, h.context());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.identity).toMatchObject({
      name: "Orbit Quest",
      classification: "ORIGINAL",
      ref: { externalId: "42" },
    });
    expect(result.data.description).toMatchObject({
      data: { value: "A fictional adventure & puzzle game." },
    });
    expect(result.data.releases).toMatchObject({
      state: "present",
      data: [
        {
          scope: { kind: "RELEASE_OBSERVATION", key: "release:700" },
          value: {
            market: "NORTH_AMERICA",
            date: { precision: "MONTH", year: 1995, month: 8, day: null },
          },
        },
      ],
    });
    expect(result.data.companies).toMatchObject({
      data: [
        { value: { role: "DEVELOPER" }, scope: { kind: "GAME" } },
        { value: { role: "PUBLISHER" } },
      ],
    });
    expect(result.data.images).toMatchObject({
      data: [
        {
          value: {
            ref: { objectType: "COVER", externalId: "12" },
            rights: "UNKNOWN",
          },
        },
        { value: { ref: { objectType: "SCREENSHOT", externalId: "12" } } },
        { value: { purpose: "ARTWORK" } },
      ],
    });
    expect(result.data.videos).toMatchObject({
      data: [{ value: { video: { provider: "YOUTUBE", id: "video123_45" } } }],
    });
    expect(result.data.ratings).toMatchObject({
      data: [
        { value: { kind: "COMMUNITY", value: 87.3, maximum: 100 } },
        { value: { kind: "CRITIC", value: 82 } },
        { value: { kind: "COMBINED", value: 84.65 } },
      ],
    });
    expect(result.data.playtime).toMatchObject({
      data: {
        value: {
          mainMinutes: 30,
          mainExtrasMinutes: 60,
          completionistMinutes: 120,
          sampleCount: 20,
        },
      },
    });
    expect(result.data.evidence).toContainEqual(
      expect.objectContaining({
        normalization: "SECONDS_TO_MINUTES",
        originalValue: 7201,
        sourceUpdatedAt: "2025-10-09T08:53:20.000Z",
      }),
    );
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("test-secret");
    expect(serialized).not.toContain("token-");
    expect(serialized).not.toContain('"image_id":');
    expect(serialized).not.toContain("publicApproved");
    expect(h.transport).toHaveBeenCalledTimes(3);
  });

  it("searches without automatically fetching candidates and returns conservative year evidence", async () => {
    const h = harness();
    const result = await h.provider.search(search, h.context());
    expect(result).toMatchObject({
      ok: true,
      data: {
        candidates: [
          {
            identity: { name: "Orbit Quest" },
            firstRelease: {
              data: { value: { precision: "YEAR", year: 1995, day: null } },
            },
          },
        ],
        nextCursor: null,
      },
    });
    expect(h.transport).toHaveBeenCalledTimes(2);
  });

  it("keeps private fields out and escapes quotes/backslashes rather than inserting a query", async () => {
    const h = harness({ game: [] });
    await h.provider.search(
      { query: 'Orbit \\"; limit 500; //', limit: 2 },
      h.context(),
    );
    const [url, init] = h.transport.mock.calls[1];
    expect(url).toBe("https://api.igdb.com/v4/games");
    expect(init.body).toContain('search "Orbit \\\\\\"; limit 500; //";');
    expect(init.body).toContain("limit 2;");
    expect(init).toMatchObject({ redirect: "error", cache: "no-store" });
    expect(String(h.transport.mock.calls[0][1].body)).toBe(
      "client_id=test-client&client_secret=test-secret&grant_type=client_credentials",
    );
    expect(h.transport.mock.calls[0][0]).not.toContain("test-secret");
    expect(
      await h.provider.search(
        { ...search, notes: "private" } as GameSearchInput,
        h.context(),
      ),
    ).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
  });

  it("uses validated platform and UTC year bounds", async () => {
    const h = harness({ game: [] });
    await h.provider.search(
      {
        ...search,
        year: 1995,
        platform: {
          provider: "IGDB",
          objectType: "PLATFORM",
          externalId: "19",
        },
      },
      h.context(),
    );
    expect(h.transport.mock.calls[1][1].body).toContain(
      "where platforms = (19) & first_release_date >= 788918400 & first_release_date < 820454400;",
    );
  });

  it("binds pagination to the normalized search and never crawls it automatically", async () => {
    const h = harness();
    const first = await h.provider.search({ ...search, limit: 1 }, h.context());
    expect(first.ok).toBe(true);
    if (!first.ok || !first.data.nextCursor)
      throw new Error("Expected next cursor");
    expect(h.transport).toHaveBeenCalledTimes(2);
    await h.provider.search(
      { ...search, limit: 1, cursor: first.data.nextCursor },
      h.context(),
    );
    expect(h.transport.mock.calls[2][1].body).toContain("offset 1;");
    expect(
      await h.provider.search(
        { query: "Different", limit: 1, cursor: first.data.nextCursor },
        h.context(),
      ),
    ).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
    expect(h.transport).toHaveBeenCalledTimes(3);
  });

  it.each([
    { query: "", limit: 1 },
    { query: "ok", limit: 21 },
    { query: "ok\n", limit: 1, year: 0 },
    { query: "ok", limit: 1, cursor: "https://internal.test" },
    {
      query: "ok",
      limit: 1,
      platform: { provider: "IGDB", objectType: "GAME", externalId: "42" },
    },
    {
      query: "ok",
      limit: 1,
      platform: {
        provider: "IGDB",
        objectType: "PLATFORM",
        externalId: "1;drop",
      },
    },
  ])(
    "rejects invalid search input without a network request",
    async (input) => {
      const h = harness();
      expect(
        await h.provider.search(input as GameSearchInput, h.context()),
      ).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
      expect(h.transport).not.toHaveBeenCalled();
    },
  );

  it.each([
    "0",
    "042",
    "9007199254740992",
    "42;fields *",
    "https://internal.test",
  ])("rejects invalid selected identity %s", async (externalId) => {
    const h = harness();
    expect(
      await h.provider.fetch(
        { game: { ...selected.game, externalId } },
        h.context(),
      ),
    ).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
    expect(h.transport).not.toHaveBeenCalled();
  });

  it("distinguishes empty search from a missing selected game", async () => {
    const h = harness({ game: [] });
    expect(await h.provider.search(search, h.context())).toMatchObject({
      ok: true,
      data: { candidates: [] },
    });
    expect(await h.provider.fetch(selected, h.context())).toMatchObject({
      ok: false,
      error: { code: "NOT_FOUND" },
    });
  });

  it.each([
    [{ ...fixture, id: 43 }],
    [{ name: "Missing identity" }],
    { error: "bad" },
  ])("rejects mismatched/malformed core responses", async (game) => {
    const h = harness({ game });
    expect(await h.provider.fetch(selected, h.context())).toMatchObject({
      ok: false,
      error: { code: "INVALID_RESPONSE" },
    });
  });

  it("retains useful core evidence when optional sections are malformed or unavailable", async () => {
    const h = harness({
      data: (url) =>
        url.endsWith("/games")
          ? json([
              {
                ...fixture,
                videos: [{ ...fixture.videos[0], video_id: "<iframe>" }],
                rating: 101,
                screenshots: [{ ...fixture.screenshots[0], game: 99 }],
              },
            ])
          : json({}, 503),
    });
    const result = await h.provider.fetch(selected, h.context());
    expect(result).toMatchObject({
      ok: true,
      data: {
        videos: { state: "invalid" },
        images: { state: "limited" },
        ratings: { state: "limited" },
        playtime: { state: "unsupported" },
      },
    });
  });

  it("marks capped arrays limited and never assigns physical release scope to broad media", async () => {
    const h = harness({
      game: [
        {
          ...fixture,
          videos: Array.from({ length: 7 }, (_, i) => ({
            ...fixture.videos[0],
            id: i + 1,
          })),
        },
      ],
    });
    const result = await h.provider.fetch(selected, h.context());
    expect(result.ok).toBe(true);
    if (!result.ok || !("data" in result.data.videos)) return;
    expect(result.data.videos.state).toBe("limited");
    expect(result.data.videos.data).toHaveLength(5);
    expect(
      result.data.videos.data.every((video) => video.scope.kind === "GAME"),
    ).toBe(true);
  });

  it("preserves unknown duration categories and does not turn ambiguous zeros into measured zero", async () => {
    const h = harness({
      time: [{ ...playtime[0], hastily: 0, normally: 29, completely: null }],
    });
    expect(await h.provider.fetch(selected, h.context())).toMatchObject({
      ok: true,
      data: {
        playtime: {
          state: "limited",
          data: {
            value: {
              mainMinutes: null,
              mainExtrasMinutes: 1,
              completionistMinutes: null,
            },
          },
        },
        diagnostics: expect.arrayContaining([
          { section: "playtime", code: "AMBIGUOUS_ZERO" },
        ]),
      },
    });
  });

  it("reuses tokens and renews early after expiration", async () => {
    const h = harness();
    await h.provider.search(search, h.context());
    await h.provider.search(search, h.context());
    expect(
      h.transport.mock.calls.filter(([url]) => url.includes("oauth2")),
    ).toHaveLength(1);
    h.advance(3600000);
    await h.provider.search(search, h.context());
    expect(
      h.transport.mock.calls.filter(([url]) => url.includes("oauth2")),
    ).toHaveLength(2);
    expect(h.starts[1] - h.starts[0]).toBeGreaterThanOrEqual(500);
  });

  it("collapses concurrent token acquisition", async () => {
    const h = harness({ game: [] });
    const results = await Promise.all([
      h.provider.search(search, h.context()),
      h.provider.search(search, h.context()),
    ]);
    expect(results.every((result) => result.ok)).toBe(true);
    expect(
      h.transport.mock.calls.filter(([url]) => url.includes("oauth2")),
    ).toHaveLength(1);
  });

  it("renews once on 401 and then reports authentication failure without leaking responses", async () => {
    const h = harness({
      data: () => json({ secret: "never-return-this" }, 401),
    });
    const result = await h.provider.search(search, h.context());
    expect(result).toEqual({
      ok: false,
      error: { code: "AUTHENTICATION_FAILED", retryable: false },
    });
    expect(h.transport).toHaveBeenCalledTimes(4);
    expect(JSON.stringify(result)).not.toContain("never-return-this");
  });

  it("honors bounded throttling and returns long Retry-After instead of waiting", async () => {
    const h = harness({
      data: (_, __, count) =>
        count === 1 ? json({}, 429, { "retry-after": "1" }) : json([]),
    });
    expect(await h.provider.search(search, h.context())).toMatchObject({
      ok: true,
    });
    expect(h.sleeps).toContain(1000);
    const throttled = harness({
      data: () => json({}, 429, { "retry-after": "120" }),
    });
    expect(
      await throttled.provider.search(search, throttled.context()),
    ).toEqual({
      ok: false,
      error: { code: "RATE_LIMITED", retryable: true, retryAfterSeconds: 120 },
    });
    expect(throttled.transport).toHaveBeenCalledTimes(2);
  });

  it("retries transient failures at most once", async () => {
    const h = harness({
      data: () => {
        throw new Error("sensitive transport details");
      },
    });
    expect(await h.provider.search(search, h.context())).toEqual({
      ok: false,
      error: { code: "UNAVAILABLE", retryable: true },
    });
    expect(h.transport).toHaveBeenCalledTimes(3);
  });

  it.each([
    () =>
      new Response("[]", {
        status: 302,
        headers: { location: "https://internal.test" },
      }),
    () => new Response("[]", { headers: { "content-type": "text/html" } }),
    () => json([], 200, { "content-length": String(2 * 1024 * 1024 + 1) }),
    () =>
      new Response("{invalid", {
        headers: { "content-type": "application/json" },
      }),
  ])(
    "rejects unsafe or malformed HTTP success without retry",
    async (response) => {
      const h = harness({ data: response });
      expect(await h.provider.search(search, h.context())).toMatchObject({
        ok: false,
        error: { code: "INVALID_RESPONSE" },
      });
      expect(h.transport).toHaveBeenCalledTimes(2);
    },
  );

  it("enforces actual received bytes without Content-Length and cancels the stream", async () => {
    const cancel = vi.fn();
    const h = harness({
      data: () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new Uint8Array(2 * 1024 * 1024 + 1));
            },
            cancel,
          }),
          { headers: { "content-type": "application/json" } },
        ),
    });
    expect(await h.provider.search(search, h.context())).toMatchObject({
      ok: false,
      error: { code: "INVALID_RESPONSE" },
    });
    expect(cancel).toHaveBeenCalled();
  });

  it("cancels before any network request", async () => {
    const h = harness();
    const abort = new AbortController();
    abort.abort();
    expect(
      await h.provider.search(search, h.context(abort.signal)),
    ).toMatchObject({ ok: false, error: { code: "CANCELLED" } });
    expect(h.transport).not.toHaveBeenCalled();
  });

  it("times out a stalled body and releases transport resources", async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    const transport = vi.fn<Transport>(
      async () =>
        new Response(new ReadableStream({ cancel }), {
          headers: { "content-type": "application/json" },
        }),
    );
    const provider = createIgdbGameMetadataProvider(credentials, { transport });
    const result = provider.search(search, {
      signal: new AbortController().signal,
      deadlineAt: defaultClock.now() + 30000,
    });
    await vi.advanceTimersByTimeAsync(8001);
    expect(await result).toMatchObject({
      ok: false,
      error: { code: "TIMEOUT" },
    });
    expect(cancel).toHaveBeenCalled();
  });

  it("aborts a sole caller's token request when cancelled", async () => {
    let transportSignal: AbortSignal | null | undefined;
    const transport = vi.fn<Transport>(async (_, init) => {
      transportSignal = init.signal;
      return new Promise(() => {});
    });
    const provider = createIgdbGameMetadataProvider(credentials, { transport });
    const abort = new AbortController();
    const promise = provider.search(search, {
      signal: abort.signal,
      deadlineAt: performance.now() + 30000,
    });
    abort.abort();
    expect(await promise).toMatchObject({
      ok: false,
      error: { code: "CANCELLED" },
    });
    await Promise.resolve();
    expect(transportSignal?.aborted).toBe(true);
  });

  it("does not cancel another caller waiting for the shared token", async () => {
    let releaseToken: (response: Response) => void = () => {};
    const h = harness({
      game: [],
      token: () =>
        new Promise((resolve) => {
          releaseToken = resolve;
        }),
    });
    const abort = new AbortController();
    const first = h.provider.search(search, h.context(abort.signal));
    const second = h.provider.search(search, h.context());
    abort.abort();
    expect(await first).toMatchObject({
      ok: false,
      error: { code: "CANCELLED" },
    });
    expect(h.transport.mock.calls[0][1].signal?.aborted).toBe(false);
    releaseToken(
      json({
        access_token: "shared-token",
        expires_in: 3600,
        token_type: "bearer",
      }),
    );
    expect(await second).toMatchObject({ ok: true, data: { candidates: [] } });
  });

  it("admits at most two data requests in flight with spaced starts", async () => {
    vi.useFakeTimers({
      toFake: ["setTimeout", "clearTimeout", "Date", "performance"],
    });
    const pending: ((response: Response) => void)[] = [];
    const starts: number[] = [];
    const transport: Transport = async (url) => {
      if (url.includes("oauth2"))
        return json({
          access_token: "shared-token",
          expires_in: 3600,
          token_type: "bearer",
        });
      starts.push(performance.now());
      return new Promise((resolve) => pending.push(resolve));
    };
    const provider = createIgdbGameMetadataProvider(credentials, { transport });
    const results = Array.from({ length: 3 }, () =>
      provider.search(search, {
        signal: new AbortController().signal,
        deadlineAt: performance.now() + 30000,
      }),
    );
    await vi.advanceTimersByTimeAsync(1001);
    expect(pending).toHaveLength(2);
    expect(starts[1] - starts[0]).toBeGreaterThanOrEqual(500);
    pending[0](json([]));
    await vi.advanceTimersByTimeAsync(25);
    expect(pending).toHaveLength(3);
    pending[1](json([]));
    pending[2](json([]));
    expect((await Promise.all(results)).every((result) => result.ok)).toBe(
      true,
    );
  });

  it("clips HTTP work to a shorter caller deadline", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
    const provider = createIgdbGameMetadataProvider(credentials, {
      transport: async () => new Promise(() => {}),
    });
    const result = provider.search(search, {
      signal: new AbortController().signal,
      deadlineAt: performance.now() + 5,
    });
    await vi.advanceTimersByTimeAsync(6);
    expect(await result).toMatchObject({
      ok: false,
      error: { code: "TIMEOUT" },
    });
  });
});
