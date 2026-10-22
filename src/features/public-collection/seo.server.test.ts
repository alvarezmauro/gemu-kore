import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ connection: vi.fn(), seo: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ connection: state.connection }));
vi.mock("@/server/services/public-collection/seo", () => ({
  getPublicSeo: state.seo,
}));
import { publicMetadata } from "./seo.server";
import { publicSeoFallback } from "./seo";
const image = {
  url: "https://collection.example/api/media/public/seo/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222",
  width: 640,
  height: 480,
  alt: "Reviewed catalog artwork",
};
const safe = {
  index: true,
  title: "An exhibit | Collection",
  description: "Canonical facts",
  canonical:
    "https://collection.example/collection/games/11111111-1111-4111-8111-111111111111",
  image,
};
beforeEach(() => {
  state.connection.mockReset().mockResolvedValue(undefined);
  state.seo.mockReset().mockResolvedValue(structuredClone(safe));
});
it("waits for request context before reading current public metadata", async () => {
  let release!: () => void;
  state.connection.mockReturnValueOnce(
    new Promise<void>((resolve) => {
      release = resolve;
    }),
  );
  const input = { kind: "home", params: {} };
  const pending = publicMetadata(input);
  expect(state.seo).not.toHaveBeenCalled();
  release();
  await pending;
  expect(state.connection).toHaveBeenCalledOnce();
  expect(state.seo).toHaveBeenCalledWith(input);
});
it("maps the admitted canonical identity and image into social metadata without spreading extra fields", async () => {
  state.seo.mockResolvedValue({
    ...safe,
    serialNumber: "PRIVATE-SERIAL",
    notes: "PRIVATE-NOTE",
    assetId: "PRIVATE-ASSET",
  });
  const metadata = await publicMetadata({ kind: "item" });
  expect(metadata).toMatchObject({
    title: safe.title,
    description: safe.description,
    robots: { index: true, follow: true },
    alternates: { canonical: safe.canonical },
    openGraph: {
      type: "website",
      title: safe.title,
      description: safe.description,
      url: safe.canonical,
      images: [image],
    },
    twitter: {
      card: "summary_large_image",
      title: safe.title,
      description: safe.description,
      images: [image],
    },
  });
  expect(JSON.stringify(metadata)).not.toMatch(
    /PRIVATE-|serialNumber|assetId|notes/,
  );
});
it("clears social images and canonical output on a later noindex response", async () => {
  await publicMetadata({ kind: "item" });
  state.seo.mockResolvedValue({ ...publicSeoFallback });
  const metadata = await publicMetadata({ kind: "home" });
  expect(metadata).toMatchObject({
    title: publicSeoFallback.title,
    description: publicSeoFallback.description,
    robots: { index: false, follow: false },
    alternates: { canonical: null },
    openGraph: { images: [] },
    twitter: { card: "summary", images: [] },
  });
  expect(metadata.openGraph).not.toHaveProperty("url");
  expect(JSON.stringify(metadata)).not.toContain(image.url);
});
it("uses generic noindex metadata when the public service fails, with no diagnostics or previous identity", async () => {
  state.seo.mockRejectedValue(
    new Error("postgresql://PRIVATE-DATABASE/credentials"),
  );
  const metadata = await publicMetadata({ kind: "home" });
  expect(metadata).toMatchObject({
    title: publicSeoFallback.title,
    description: publicSeoFallback.description,
    robots: { index: false, follow: false },
    alternates: { canonical: null },
    openGraph: { images: [] },
    twitter: { images: [] },
  });
  expect(JSON.stringify(metadata)).not.toMatch(
    /PRIVATE-|postgresql|credentials|An exhibit/,
  );
});
