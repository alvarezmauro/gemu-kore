import { afterEach, expect, it, vi } from "vitest";
import { fetchModel } from "./fetch-model";
import { modelPresentation, ModelError } from "./contracts";
const id = "11111111-1111-4111-8111-111111111111";
const presentation = modelPresentation.parse({
  schemaVersion: 1,
  presentationKey: "fixture",
  title: "Model",
  source: "Catalog",
  description: "Preview",
  resource: {
    id,
    url: `/api/media/private/${id}`,
    mimeType: "model/gltf-binary",
    byteLength: 3,
  },
  poster: null,
  settings: {},
});
afterEach(() => vi.unstubAllGlobals());
it("fetches only the validated same-origin resource without caches and reports actual bytes", async () => {
  const request = vi.fn().mockResolvedValue(
    new Response(new Uint8Array([1, 2, 3]), {
      headers: { "Content-Type": "model/gltf-binary", "Content-Length": "3" },
    }),
  );
  vi.stubGlobal("fetch", request);
  const progress = vi.fn();
  expect(
    new Uint8Array(
      await fetchModel(presentation, new AbortController().signal, progress),
    ),
  ).toEqual(new Uint8Array([1, 2, 3]));
  expect(request).toHaveBeenCalledWith(
    presentation.resource.url,
    expect.objectContaining({
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error",
    }),
  );
  expect(progress).toHaveBeenCalledWith(3, 3);
  await expect(
    fetchModel(
      {
        ...presentation,
        resource: {
          ...presentation.resource,
          url: "https://example.com/model.glb",
        },
      },
      new AbortController().signal,
      progress,
    ),
  ).rejects.toThrow(ModelError);
  expect(request).toHaveBeenCalledTimes(1);
});
it.each([401, 403, 404, 503])(
  "stops on an unauthorized/unavailable model response (%s)",
  async (status) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("{}", { status })),
    );
    await expect(
      fetchModel(presentation, new AbortController().signal, vi.fn()),
    ).rejects.toThrow(ModelError);
  },
);
it("cancels an oversized stream and refuses incorrect content type, missing length and truncation", async () => {
  const cancel = vi.fn();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(
        new ReadableStream({
          start(c) {
            c.enqueue(new Uint8Array(4));
          },
          cancel,
        }),
        {
          headers: {
            "Content-Type": "model/gltf-binary",
            "Content-Length": "3",
          },
        },
      ),
    ),
  );
  await expect(
    fetchModel(presentation, new AbortController().signal, vi.fn()),
  ).rejects.toThrow(ModelError);
  expect(cancel).toHaveBeenCalled();
  const invalidHeaders: Record<string, string>[] = [
    { "Content-Type": "text/html", "Content-Length": "3" },
    { "Content-Type": "model/gltf-binary" },
    { "Content-Type": "model/gltf-binary", "Content-Length": "3" },
  ];
  for (const headers of invalidHeaders) {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(new Response(new Uint8Array([1, 2]), { headers })),
    );
    await expect(
      fetchModel(presentation, new AbortController().signal, vi.fn()),
    ).rejects.toThrow(ModelError);
  }
});
