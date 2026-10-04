import { ESLint } from "eslint";
import { expect, it } from "vitest";

const lint = new ESLint();
const repositoryPath = "src/server/repositories/catalog/identities.ts";
const servicePath = "src/server/services/access.ts";

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
