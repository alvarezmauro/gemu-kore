import { afterAll, beforeAll, expect, it } from "vitest";
import { disconnectDatabase, getDatabase } from "@/server/db/client";
import { checkDatabase } from "@/server/db/health";
import { withTransaction } from "@/server/db/transaction";

beforeAll(async () => {
  await getDatabase().$executeRaw`
    CREATE TABLE test_transaction_probe (id integer PRIMARY KEY)
  `;
});

afterAll(async () => {
  try {
    await getDatabase()
      .$executeRaw`DROP TABLE IF EXISTS test_transaction_probe`;
  } finally {
    await disconnectDatabase();
  }
});

it("connects through the application's database health check", async () => {
  await expect(checkDatabase()).resolves.toBeUndefined();
});

it("commits a successful transaction and returns its result", async () => {
  const result = await withTransaction(async (transaction) => {
    await transaction.$executeRaw`INSERT INTO test_transaction_probe (id) VALUES (1)`;
    return "committed";
  });

  expect(result).toBe("committed");
  const rows = await getDatabase().$queryRaw<{ id: number }[]>`
    SELECT id FROM test_transaction_probe WHERE id = 1
  `;
  expect(rows).toEqual([{ id: 1 }]);
});

it("rolls back writes when an operation fails", async () => {
  await expect(
    withTransaction(async (transaction) => {
      await transaction.$executeRaw`INSERT INTO test_transaction_probe (id) VALUES (2)`;
      throw new Error("Operation failed");
    }),
  ).rejects.toThrow("Operation failed");

  const rows = await getDatabase().$queryRaw<{ id: number }[]>`
    SELECT id FROM test_transaction_probe WHERE id = 2
  `;
  expect(rows).toEqual([]);
});
