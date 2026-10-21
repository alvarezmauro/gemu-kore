import { expect, it, vi } from "vitest";
import { findPublicDetail } from "./detail";
import type { Policy } from "./policy";
import type { TransactionClient } from "@/server/db/transaction";
vi.mock("server-only", () => ({}));
it.each(Array.from({ length: 16 }, (_, n) => n))(
  "never overfetches hidden personal fields (policy combination %s)",
  async (n) => {
    const policy: Policy = {
      revision: 1,
      publicCollectionEnabled: true,
      allowSearchEngineIndexing: false,
      showPersonalPhotos: false,
      showSerialNumbers: Boolean(n & 1),
      showNotes: Boolean(n & 2),
      showLocations: Boolean(n & 4),
      showDefects: Boolean(n & 8),
    };
    const read = vi.fn().mockResolvedValue(null);
    const tx = {
      collectionItem: { findFirst: read },
    } as unknown as TransactionClient;
    await findPublicDetail(
      "dfad76dc-f390-4db6-9ea5-e062461b68c2",
      "GAME",
      policy,
      tx,
    );
    const query = read.mock.calls[0][0];
    expect(query.where.publicationStatus).toBe("PUBLISHED");
    expect(query.select.serialNumber).toBe(policy.showSerialNumbers);
    expect(query.select.notes).toBe(policy.showNotes);
    expect(query.select.locationId).toBe(policy.showLocations);
    expect(Boolean(query.select.defects)).toBe(policy.showDefects);
    expect(query).not.toHaveProperty("include");
    // Enforce query selection, not only eventual DTO redaction.
    expect(JSON.stringify(query.select)).not.toMatch(
      /observedMarkings|repairNote|resolvedAt|metadata|objectKey|storageNamespace|originalFilename|sha256|createdById|updatedById|publishedById|revision|trailerUrl/,
    );
  },
);
