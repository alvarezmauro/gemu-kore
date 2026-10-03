import "server-only";

import { getDatabase } from "./client";

export async function checkDatabase() {
  const rows = await getDatabase().$queryRaw<{ ready: number }[]>`
    SELECT 1::integer AS ready
  `;

  if (rows.length !== 1 || rows[0].ready !== 1) {
    throw new Error("Database health check failed.");
  }
}
