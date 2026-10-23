import { ESLint } from "eslint";
import { beforeAll, expect, it } from "vitest";

const lint = new ESLint();
const repositoryPath = "src/server/repositories/catalog/identities.ts";
const servicePath = "src/server/services/access.ts";

beforeAll(async () => {
  // Loading the complete Next/TypeScript lint configuration is suite setup,
  // rather than part of the first boundary assertion's five-second budget.
  await lint.calculateConfigForFile(repositoryPath);
});

async function boundaryMessages(code: string, filePath: string) {
  const [result] = await lint.lintText(code, { filePath });
  expect(result.fatalErrorCount).toBe(0);
  return result.messages.filter((message) =>
    ["no-restricted-imports", "no-restricted-syntax"].includes(
      message.ruleId ?? "",
    ),
  );
}

it.each([
  [repositoryPath, "react"],
  [repositoryPath, "next/headers"],
  [repositoryPath, "@/server/auth/access"],
  [repositoryPath, "../../services/access"],
  [repositoryPath, "@/server/providers/example"],
  [repositoryPath, "@/features/auth/contracts"],
  [servicePath, "@/components/ui/button"],
  [servicePath, "@/features/collection/components/item-card"],
  [servicePath, "next/server"],
  [servicePath, "@/features/collection/actions"],
  [servicePath, "../db/client"],
  ["src/app/page.tsx", "@/server/repositories/collection/identities"],
])("rejects the layer-crossing import in %s from %s", async (path, source) => {
  const messages = await boundaryMessages(
    `import "server-only"; import { example } from "${source}"; export { example };`,
    path,
  );
  expect(
    messages.some((message) => message.ruleId === "no-restricted-imports"),
  ).toBe(true);
});

it.each(["@/server/db/transaction", "../../db/transaction"])(
  "rejects a repository importing the transaction owner through %s",
  async (source) => {
    expect(
      await boundaryMessages(
        `import "server-only"; import { withTransaction } from "${source}"; export { withTransaction };`,
        repositoryPath,
      ),
    ).not.toEqual([]);
  },
);

it("rejects direct transaction creation inside a repository", async () => {
  expect(
    await boundaryMessages(
      'import "server-only"; export const nested = (db) => db.$transaction(() => {});',
      repositoryPath,
    ),
  ).not.toEqual([]);
});

it("requires an application repository's server-only marker", async () => {
  expect(
    await boundaryMessages("export const marker = true;", repositoryPath),
  ).not.toEqual([]);
});

it("permits server-local persistence types and transaction-bound repository reads", async () => {
  expect(
    await boundaryMessages(
      `
    import "server-only";
    import type { TransactionClient } from "@/server/db/transaction";
    import { getDatabase } from "@/server/db/client";
    export const read = (db: TransactionClient = getDatabase()) => db.game.findUnique({ where: { id: "id" }, select: { id: true } });
  `,
      repositoryPath,
    ),
  ).toEqual([]);
});

it("permits service-owned transactions and neutral feature contracts", async () => {
  expect(
    await boundaryMessages(
      `
    import "server-only";
    import { withTransaction } from "../db/transaction";
    import type { PrivateWelcome } from "@/features/auth/contracts";
    export const operation = (): Promise<PrivateWelcome> => withTransaction(async () => ({ role: "VIEWER" }));
  `,
      servicePath,
    ),
  ).toEqual([]);
});

it.each([
  [servicePath, "@aws-sdk/client-s3"],
  ["src/app/page.tsx", "@aws-sdk/client-s3"],
  ["src/features/media/contracts.ts", "@aws-sdk/client-s3"],
  ["src/server/storage/s3.ts", "@/server/repositories/access"],
  ["src/server/storage/index.ts", "@aws-sdk/client-s3"],
])("rejects storage layer bypass in %s from %s", async (path, source) => {
  expect(
    await boundaryMessages(
      `import "server-only"; import { example } from "${source}"; export { example };`,
      path,
    ),
  ).not.toEqual([]);
});

it("permits the marked adapter's SDK import and requires its server marker", async () => {
  expect(
    await boundaryMessages(
      'import "server-only"; import { S3Client } from "@aws-sdk/client-s3"; export { S3Client };',
      "src/server/storage/s3.ts",
    ),
  ).toEqual([]);
  expect(
    await boundaryMessages(
      "export const marker = true;",
      "src/server/storage/index.ts",
    ),
  ).not.toEqual([]);
});

it.each([
  [
    "src/server/providers/game-metadata/igdb.ts",
    "@/server/repositories/catalog/management",
  ],
  ["src/server/providers/game-metadata/igdb.ts", "../../services/access"],
  ["src/server/providers/game-metadata/igdb.ts", "@/features/games/contracts"],
  ["src/server/providers/game-metadata/igdb.ts", "@prisma/client"],
  ["src/server/providers/game-metadata/igdb.ts", "react"],
  [servicePath, "@/server/providers/game-metadata/igdb"],
  [servicePath, "../../providers/game-metadata/igdb-mapping"],
  [servicePath, "@/server/providers/game-metadata/http"],
  ["src/app/page.tsx", "@/server/providers/game-metadata"],
])("rejects metadata boundary bypass in %s from %s", async (path, source) => {
  expect(
    await boundaryMessages(
      `import "server-only"; import { example } from "${source}"; export { example };`,
      path,
    ),
  ).not.toEqual([]);
});

it("requires server-only providers and permits service use of the neutral composition point", async () => {
  expect(
    await boundaryMessages(
      "export const example = true;",
      "src/server/providers/game-metadata/contracts.ts",
    ),
  ).not.toEqual([]);
  expect(
    await boundaryMessages(
      'import "server-only"; import { getGameMetadataProvider } from "@/server/providers/game-metadata"; export { getGameMetadataProvider };',
      servicePath,
    ),
  ).toEqual([]);
});
