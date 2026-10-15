import { afterEach, expect, it, vi } from "vitest";
import {
  requestCollectionSearch,
  requestPaletteSearch,
  requestFilteredSearch,
} from "./client";
afterEach(() => vi.unstubAllGlobals());
const result = {
  state: "ready",
  items: [],
  hasMore: false,
  offset: 0,
  limit: 20,
};
it("posts validated structured controls separately from private free text", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue({ ok: true, json: async () => result });
  vi.stubGlobal("fetch", fetcher);
  const signal = new AbortController().signal;
  const controls = {
    type: "game" as const,
    hasBox: "unknown" as const,
    sort: "year-desc" as const,
  };
  expect(
    await requestFilteredSearch("private serial", signal, controls),
  ).toEqual(result);
  expect(fetcher).toHaveBeenCalledWith(
    "/api/search/filtered",
    expect.objectContaining({
      method: "POST",
      cache: "no-store",
      body: JSON.stringify({ q: "private serial", controls }),
      signal,
    }),
  );
});
it("keeps private search text in a no-store POST body", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue({ ok: true, json: async () => result });
  vi.stubGlobal("fetch", fetcher);
  const signal = new AbortController().signal;
  expect(await requestCollectionSearch("private serial", signal)).toEqual(
    result,
  );
  expect(fetcher).toHaveBeenCalledWith("/api/search/private", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ q: "private serial" }),
    cache: "no-store",
    signal,
  });
});
it.each([401, 403])(
  "returns a redacted access error for %s",
  async (status) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status }));
    await expect(
      requestCollectionSearch("chrono", new AbortController().signal),
    ).rejects.toThrow(/access has changed/);
  },
);
it.each([400, 503])(
  "does not expose raw response bodies for %s",
  async (status) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status,
        json: async () => ({ error: "private database detail" }),
      }),
    );
    await expect(
      requestCollectionSearch("chrono", new AbortController().signal),
    ).rejects.not.toThrow(/database detail/);
  },
);
it("redacts malformed JSON and transport diagnostics", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce({
      ok: true,
      json: async () => {
        throw new Error("private payload");
      },
    })
    .mockRejectedValueOnce(new Error("database secret"));
  vi.stubGlobal("fetch", fetcher);
  await expect(
    requestCollectionSearch("chrono", new AbortController().signal),
  ).rejects.toThrow("We couldn't load these search results");
  await expect(
    requestCollectionSearch("chrono", new AbortController().signal),
  ).rejects.toThrow("Search is unavailable");
});
it("checks the narrow result contract before rendering", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ...result, notes: "private" }),
    }),
  );
  await expect(
    requestCollectionSearch("chrono", new AbortController().signal),
  ).rejects.toThrow(/couldn't load/);
});
it("uses a separate private POST and validates both palette scopes", async () => {
  const data = {
    collection: result,
    catalog: [
      {
        id: "b41b30e9-0562-4896-9740-f9b742c102eb",
        kind: "game",
        title: "Chrono Trigger",
        context: "",
        identificationStatus: null,
      },
    ],
    catalogHasMore: false,
  };
  const fetcher = vi
    .fn()
    .mockResolvedValue({ ok: true, json: async () => data });
  vi.stubGlobal("fetch", fetcher);
  const signal = new AbortController().signal;
  expect(await requestPaletteSearch("private note", signal)).toEqual(data);
  expect(fetcher).toHaveBeenCalledWith(
    "/api/search/palette",
    expect.objectContaining({
      method: "POST",
      cache: "no-store",
      body: '{"q":"private note"}',
      signal,
    }),
  );
  fetcher.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      ...data,
      catalog: [{ ...data.catalog[0], serialNumber: "secret" }],
    }),
  });
  await expect(requestPaletteSearch("note", signal)).rejects.toThrow(
    /couldn't load/,
  );
});
