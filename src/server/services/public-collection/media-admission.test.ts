import { beforeEach, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { fullArtwork, boxFaces } from "@/lib/three/packaging-contracts";
vi.mock("server-only", () => ({}));
vi.mock("@/server/repositories/public-collection/media", () => ({
  assetNodes: vi.fn(),
  mediaIdentity: vi.fn(),
  itemMediaUses: vi.fn(),
}));
import {
  assetNodes,
  mediaIdentity,
  itemMediaUses,
} from "@/server/repositories/public-collection/media";
vi.mock("@/server/repositories/public-collection/components", () => ({
  publicComponents: vi.fn(),
}));
import { publicComponents } from "@/server/repositories/public-collection/components";
import { publicComponentViews } from "./components";
import { assetAdmission, publicItemMedia, type PublicAsset } from "./media";
import type { TransactionClient } from "@/server/db/transaction";
const tx = {} as TransactionClient;
let graph: Map<string, PublicAsset>;
function node(id: string, sources: string[] = []): PublicAsset {
  const asset: PublicAsset = {
    id,
    state: "READY",
    kind: "IMAGE",
    scope: "CATALOG",
    deliveryClass: "DISPLAY",
    mimeType: "image/png",
    sizeBytes: BigInt(100),
    width: 80,
    height: 60,
    publicSafe: true,
    reviewedAt: new Date(),
    rightsStatus: "APPROVED",
    inputs: sources.map((sourceAssetId) => ({
      sourceAssetId,
      purpose: "RESIZE",
    })),
  };
  graph.set(id, asset);
  return asset;
}
beforeEach(() => {
  graph = new Map();
  vi.mocked(assetNodes)
    .mockReset()
    .mockImplementation(async (ids) =>
      ids.flatMap((id) => (graph.has(id) ? [graph.get(id)!] : [])),
    );
});
it("batches distinct photo graphs, memoizes shared ancestors only within the request, and observes revoked rights next time", async () => {
  const ids = Array.from({ length: 30 }, (_, n) => `photo-${n}`);
  ids.forEach((id, n) => {
    node(id, [`original-${n}`]);
    node(`original-${n}`, ["shared"]);
  });
  node("shared");
  const admit = assetAdmission(tx);
  expect(
    (await Promise.all(ids.map((id) => admit(id, "IMAGE")))).every(Boolean),
  ).toBe(true);
  expect(assetNodes).toHaveBeenCalledTimes(3);
  expect(vi.mocked(assetNodes).mock.calls.map(([ids]) => ids.length)).toEqual([
    30, 30, 1,
  ]);
  await admit(ids[0], "IMAGE");
  expect(assetNodes).toHaveBeenCalledTimes(3);
  graph.get("shared")!.rightsStatus = "RESTRICTED";
  expect(await assetAdmission(tx)(ids[0], "IMAGE")).toBeNull();
});
it("accepts shared DAG branches, but denies cycles, missing nodes and unsupported dependency purposes", async () => {
  node("root", ["left", "right"]);
  node("left", ["leaf"]);
  node("right", ["leaf"]);
  node("leaf");
  expect(await assetAdmission(tx)("root", "IMAGE")).not.toBeNull();
  node("leaf", ["root"]);
  expect(await assetAdmission(tx)("root", "IMAGE")).toBeNull();
  graph.delete("leaf");
  expect(await assetAdmission(tx)("root", "IMAGE")).toBeNull();
  node("leaf");
  graph.get("root")!.inputs[0].purpose =
    "THUMBNAIL" as PublicAsset["inputs"][number]["purpose"];
  expect(await assetAdmission(tx)("root", "IMAGE")).toBeNull();
});

it("checks the full depth of a shared subtree even when a shallow path visited it first", async () => {
  node("root", ["shared", "long-0"]);
  node("shared", ["leaf"]);
  node("leaf");
  for (let n = 0; n < 15; n++)
    node(`long-${n}`, [n === 14 ? "shared" : `long-${n + 1}`]);
  expect(await assetAdmission(tx)("root", "IMAGE")).toBeNull();
});
it("retains the depth, total-node and per-node degree limits during batched traversal", async () => {
  for (let n = 0; n <= 16; n++)
    node(`depth-${n}`, n < 16 ? [`depth-${n + 1}`] : []);
  expect(await assetAdmission(tx)("depth-0", "IMAGE")).not.toBeNull();
  node("depth-16", ["depth-17"]);
  node("depth-17");
  vi.mocked(assetNodes).mockClear();
  expect(await assetAdmission(tx)("depth-0", "IMAGE")).toBeNull();
  expect(
    vi.mocked(assetNodes).mock.calls.flatMap(([ids]) => ids),
  ).not.toContain("depth-17");
  const leaves = Array.from({ length: 129 }, (_, n) => `leaf-${n}`);
  leaves.forEach((id) => node(id));
  node("wide", leaves.slice(0, 127));
  expect(await assetAdmission(tx)("wide", "IMAGE")).not.toBeNull();
  node("wide", leaves.slice(0, 128));
  expect(await assetAdmission(tx)("wide", "IMAGE")).toBeNull();
  node("wide", leaves);
  vi.mocked(assetNodes).mockClear();
  expect(await assetAdmission(tx)("wide", "IMAGE")).toBeNull();
  expect(assetNodes).toHaveBeenCalledTimes(1);
});
it.each([
  { state: "PENDING" },
  { rightsStatus: "RESTRICTED" },
  { deliveryClass: "ORIGINAL" },
  { publicSafe: false },
  { reviewedAt: null },
  { kind: "MODEL_3D" },
  { mimeType: "image/svg+xml" },
  { sizeBytes: BigInt(0) },
  { sizeBytes: BigInt(21) * BigInt(1024) * BigInt(1024) },
  { width: 0 },
  { height: 12001 },
] as Partial<PublicAsset>[])(
  "fails closed on ineligible display case %#",
  async (override) => {
    Object.assign(node("display"), override);
    expect(await assetAdmission(tx)("display", "IMAGE")).toBeNull();
  },
);

it("looks beyond invalid gallery batches, retains the 25th-image lookahead and finds the first later eligible model", async () => {
  vi.mocked(mediaIdentity).mockResolvedValue({
    id: "copy",
    type: "CONSOLE",
    publicationStatus: "PUBLISHED",
    ownedConsole: null,
    ownedGame: null,
    ownedAccessory: null,
  });
  const uses: Awaited<ReturnType<typeof itemMediaUses>> = [];
  for (let index = 0; index < 66; index++) {
    const id = `use-${index}`;
    const model = index >= 58 && index <= 64;
    const asset = node(id);
    if (model)
      Object.assign(asset, { kind: "MODEL_3D", mimeType: "model/gltf-binary" });
    if (index < 32 || (model && index < 64)) asset.rightsStatus = "RESTRICTED";
    uses.push({
      id,
      publicDisplayAssetId: id,
      publicDisplayAsset: asset,
      publicApproved: true,
      approvedAt: new Date(),
      altText: null,
      caption: null,
      kind: "catalog",
      role: model ? "MODEL_3D" : "GALLERY",
      image: !model,
      model,
      source: "Catalog artwork",
    });
  }
  vi.mocked(itemMediaUses).mockResolvedValue(uses);
  const gallery = await publicItemMedia(
    "copy",
    { showPersonalPhotos: false } as Parameters<typeof publicItemMedia>[1],
    tx,
  );
  expect(gallery.images).toHaveLength(24);
  expect(gallery.images[0].url).toContain("use-32");
  expect(gallery.hasMore).toBe(true);
  expect(gallery.model?.useId).toBe("use-64");
  expect(
    vi.mocked(assetNodes).mock.calls.flatMap(([ids]) => ids),
  ).not.toContain("use-65");
});

it("batches sibling inputs and serializes database batches on the transaction connection", async () => {
  const leaves = Array.from({ length: 127 }, (_, n) => `input-${n}`);
  leaves.forEach((id) => node(id));
  node("root", leaves);
  expect(await assetAdmission(tx)("root", "IMAGE")).not.toBeNull();
  expect(assetNodes).toHaveBeenCalledTimes(2);
  let active = 0,
    maximum = 0;
  vi.mocked(assetNodes).mockImplementation(async (ids) => {
    active++;
    maximum = Math.max(maximum, active);
    await Promise.resolve();
    active--;
    return ids.map((id) => graph.get(id)!);
  });
  const roots = Array.from({ length: 260 }, (_, n) => `root-${n}`);
  roots.forEach((id) => node(id, ["input-0"]));
  const admit = assetAdmission(tx);
  expect(
    (await Promise.all(roots.map((id) => admit(id, "IMAGE")))).every(Boolean),
  ).toBe(true);
  expect(maximum).toBe(1);
  expect(
    vi.mocked(assetNodes).mock.calls.every(([ids]) => ids.length <= 128),
  ).toBe(true);
});

it("shares artwork lineage across component slots and batches, skips invalid descriptors and rechecks rights on the next request", async () => {
  vi.mocked(mediaIdentity).mockResolvedValue({
    id: randomUUID(),
    type: "GAME",
    publicationStatus: "PUBLISHED",
    ownedConsole: null,
    ownedAccessory: null,
    ownedGame: {
      gameReleaseId: randomUUID(),
      gameRelease: { gameId: randomUUID() },
    },
  });
  const source = node(randomUUID());
  const artwork = node(randomUUID(), [source.id]);
  const template = {
    id: randomUUID(),
    revision: 1,
    status: "READY" as const,
    familyKey: "snes-cardboard",
    geometryType: "PROCEDURAL_BOX" as const,
    baseModelAssetId: null,
    dimensions: { schemaVersion: 1, widthMm: 180, heightMm: 125, depthMm: 30 },
    cameraSettings: { preset: "package" },
    metadata: { synthetic: true },
    slots: boxFaces.map((face) => ({
      id: randomUUID(),
      name: face.name,
      required: face.required,
      target: { schemaVersion: 1, kind: "PROCEDURAL_FACE", face: face.face },
    })),
  };
  const components: Awaited<ReturnType<typeof publicComponents>> = Array.from(
    { length: 13 },
    (_, n) => ({
      id: randomUUID(),
      name: `Expected box ${n}`,
      kind: "PACKAGING",
      presentationTemplateRevision: n === 0 ? 0 : 1,
      packagingTemplate: template,
      physicalMediaTemplate: null,
      physicalMediaBindings: [],
      packagingBindings: template.slots.map((slot) => ({
        packagingTextureSlotId: slot.id,
        assetId: artwork.id,
        transform: fullArtwork,
      })),
    }),
  );
  vi.mocked(publicComponents).mockResolvedValue(components);
  const views = await publicComponentViews(randomUUID(), tx);
  expect(views).toHaveLength(12);
  expect(views[0].name).toBe("Expected box 1");
  expect(assetNodes).toHaveBeenCalledTimes(2);
  source.rightsStatus = "RESTRICTED";
  expect(await publicComponentViews(randomUUID(), tx)).toEqual([]);
});

it("bounds prefetched nodes across branching graphs before DFS can visit every sibling", async () => {
  const siblings = Array.from({ length: 100 }, (_, n) => `sibling-${n}`);
  const extra = Array.from({ length: 100 }, (_, n) => `extra-${n}`);
  siblings.forEach((id) => node(id));
  extra.forEach((id) => node(id));
  node("root", siblings);
  node(siblings[0], extra);
  expect(await assetAdmission(tx)("root", "IMAGE")).toBeNull();
  const fetched = new Set(
    vi.mocked(assetNodes).mock.calls.flatMap(([ids]) => ids),
  );
  expect(fetched.size).toBeLessThanOrEqual(128);
  expect(fetched.has(extra[0])).toBe(false);
});
