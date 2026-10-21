import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/server/services/public-collection", async () => ({
  ...(await import("@/server/services/public-collection/common")),
  getPublicCollection: state.read,
}));
import { PublicCollectionError } from "@/server/services/public-collection/common";
import { publicSearchRequest } from "./public-search";
beforeEach(() => {
  vi.resetAllMocks();
});
it("reads only the public contract and ignores forged role/cookie headers", async () => {
  state.read.mockResolvedValue({ items: [], counts: { total: 0 } });
  const response = await publicSearchRequest(
    new Request(
      "https://example.test/api/search/public?q=Game&type=game&page=2",
      { headers: { cookie: "role=ADMIN", "x-role": "ADMIN" } },
    ),
  );
  expect(response.status).toBe(200);
  expect(state.read).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ q: "Game", type: "GAME", offset: 20, limit: 20 }),
  );
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
});
it.each(["role=ADMIN", "q=first&q=second", "page=252", "limit=5000"])(
  "retains policy-first denial for malformed controls %s",
  async (query) => {
    state.read.mockRejectedValueOnce(new PublicCollectionError("NOT_FOUND"));
    const denied = await publicSearchRequest(
      new Request(`https://example.test/api/search/public?${query}`),
    );
    expect(denied.status).toBe(404);
    expect(state.read).toHaveBeenCalledWith(null);
    state.read.mockRejectedValueOnce(
      new PublicCollectionError("INVALID_INPUT"),
    );
    const invalid = await publicSearchRequest(
      new Request(`https://example.test/api/search/public?${query}`),
    );
    expect(invalid.status).toBe(400);
    expect(invalid.headers.get("cache-control")).toBe("no-store");
  },
);
it("returns a generic uncached 503 without exception details", async () => {
  state.read.mockRejectedValue(
    new Error("postgresql://secret/private-object-key"),
  );
  const response = await publicSearchRequest(
    new Request("https://example.test/api/search/public"),
  );
  expect(response.status).toBe(503);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.text()).not.toMatch(/secret|postgresql|object-key/);
});
