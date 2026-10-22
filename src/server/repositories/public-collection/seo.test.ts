import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { seoIdentity, sitemapItems, sitemapLimit } from "./seo";
import type { TransactionClient } from "@/server/db/transaction";
it("metadata selects only published canonical identities regardless of optional personal detail gates", async () => {
  const findFirst = vi.fn().mockResolvedValue(null),
    tx = { collectionItem: { findFirst } } as unknown as TransactionClient;
  await seoIdentity("11111111-1111-4111-8111-111111111111", "GAME", tx);
  const query = findFirst.mock.calls[0][0];
  expect(query.where).toMatchObject({
    type: "GAME",
    publicationStatus: "PUBLISHED",
  });
  const text = JSON.stringify(query.select);
  for (const key of [
    "serialNumber",
    "notes",
    "location",
    "defects",
    "user",
    "publishedBy",
    "asset",
    "metadata",
    "revision",
  ])
    expect(text).not.toContain(key);
  expect(text).toContain("descriptionOverride");
  expect(text).toContain("gameRelease");
});
it("bounds sitemap reads by UUID prefix and published status without offsets or private hydration", async () => {
  const findMany = vi.fn().mockResolvedValue([]),
    tx = { collectionItem: { findMany } } as unknown as TransactionClient;
  await sitemapItems("ab", tx);
  expect(findMany).toHaveBeenCalledWith({
    where: {
      publicationStatus: "PUBLISHED",
      id: {
        gte: "ab000000-0000-0000-0000-000000000000",
        lte: "abffffff-ffff-ffff-ffff-ffffffffffff",
      },
    },
    select: { id: true, type: true },
    orderBy: { id: "asc" },
    take: sitemapLimit + 1,
  });
});
