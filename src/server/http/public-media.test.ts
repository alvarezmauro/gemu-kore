import { Readable } from "node:stream";
import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  resolve: vi.fn(),
  get: vi.fn(),
  stat: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/server/services/public-collection/media", () => ({
  mediaDelivery: state.resolve,
}));
vi.mock("@/server/storage", () => ({
  getObjectStorage: () => ({ get: state.get, stat: state.stat }),
}));
import { PublicCollectionError } from "@/server/services/public-collection/common";
import { publicMediaRequest } from "./public-media";
beforeEach(() => {
  vi.clearAllMocks();
  state.resolve.mockResolvedValue({
    locator: { storageNamespace: "hidden", objectKey: "secret" },
    mimeType: "image/png",
    sizeBytes: 4,
  });
  state.stat.mockResolvedValue({ contentType: "image/png", sizeBytes: 4 });
  state.get.mockImplementation(async (_l, o) => ({
    body: Readable.from([
      Buffer.from("safe").subarray(
        o.range?.start ?? 0,
        o.range ? o.range.end + 1 : 4,
      ),
    ]),
    contentType: "image/png",
    sizeBytes: o.range ? o.range.end - o.range.start + 1 : 4,
  }));
});
it.each(["GET", "HEAD"])(
  "admits current context before malformed ranges, storage access or conditional responses for %s",
  async (method) => {
    state.resolve.mockRejectedValue(new PublicCollectionError("NOT_FOUND"));
    const r = await publicMediaRequest(
      new Request("https://example.com/api/media/public/items/x/catalog/y", {
        method,
        headers: { range: "bytes=bad", "If-None-Match": "cached" },
      }),
      {},
    );
    expect(r.status).toBe(404);
    expect(r.headers.get("Cache-Control")).toBe("no-store");
    expect(r.headers.get("Content-Range")).toBeNull();
    expect(await r.text()).not.toContain("secret");
    expect(state.get).not.toHaveBeenCalled();
    expect(state.stat).not.toHaveBeenCalled();
  },
);
it("streams exact approved bytes, safe metadata, and validated single ranges without storage redirects", async () => {
  const r = await publicMediaRequest(
    new Request("https://example.com/media", {
      headers: { Range: "bytes=1-2" },
    }),
    {},
  );
  expect(r.status).toBe(206);
  expect(await r.text()).toBe("af");
  expect(r.headers.get("Content-Range")).toBe("bytes 1-2/4");
  expect(r.headers.get("Content-Length")).toBe("2");
  expect(r.headers.get("X-Content-Type-Options")).toBe("nosniff");
  expect(r.headers.get("Location")).toBeNull();
  const head = await publicMediaRequest(
    new Request("https://example.com/media", { method: "HEAD" }),
    {},
  );
  expect(head.status).toBe(200);
  expect(await head.text()).toBe("");
  expect(state.stat).toHaveBeenCalledOnce();
});
it.each(["bytes=4-", "bytes=3-1", "bytes=-0", "bytes=0-1,2-3", "bytes=bad"])(
  "rejects invalid admitted ranges %s",
  async (range) => {
    const r = await publicMediaRequest(
      new Request("https://example.com/media", { headers: { range } }),
      {},
    );
    expect(r.status).toBe(416);
    expect(r.headers.get("Content-Range")).toBe("bytes */4");
    expect(state.get).not.toHaveBeenCalled();
  },
);
it("cancels streams with unexpected metadata and sanitizes failures", async () => {
  const body = Readable.from([Buffer.from("secret")]);
  state.get.mockResolvedValue({
    body,
    contentType: "image/png",
    sizeBytes: 999,
  });
  const r = await publicMediaRequest(
    new Request("https://example.com/media"),
    {},
  );
  expect(r.status).toBe(503);
  expect(body.destroyed).toBe(true);
  expect(await r.text()).not.toContain("secret");
});
