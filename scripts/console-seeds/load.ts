import { open } from "node:fs/promises";
import { resolve } from "node:path";
import {
  consoleSeedFiles,
  consoleSeedSchema,
} from "../../src/features/catalog/seeds/format";
const maxFileBytes = 2 * 1024 * 1024;
export async function loadConsoleSeeds(directory: string) {
  const combined: Record<string, unknown> = { schemaVersion: 1 };
  for (const file of consoleSeedFiles) {
    const handle = await open(resolve(directory, file.path), "r");
    try {
      // Limit actual reads as well as stat size, including files changed after opening.
      const buffer = Buffer.alloc(maxFileBytes + 1);
      let size = 0;
      while (size < buffer.length) {
        const read = await handle.read(
          buffer,
          size,
          buffer.length - size,
          null,
        );
        if (!read.bytesRead) break;
        size += read.bytesRead;
      }
      if (size > maxFileBytes)
        throw new Error(`${file.path}: seed file exceeds 2 MiB.`);
      let data: unknown;
      try {
        data = JSON.parse(buffer.toString("utf8", 0, size));
      } catch {
        throw new Error(`${file.path}: invalid JSON.`);
      }
      const parsed = file.schema.safeParse(data);
      if (!parsed.success)
        throw new Error(
          `${file.path}: ${parsed.error.issues
            .map(
              (issue) => `${issue.path.join(".") || "file"}: ${issue.message}`,
            )
            .slice(0, 5)
            .join(" ")}`,
        );
      Object.assign(combined, parsed.data);
    } finally {
      await handle.close();
    }
  }
  const result = consoleSeedSchema.safeParse(combined);
  if (!result.success)
    throw new Error(
      result.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .slice(0, 5)
        .join(" "),
    );
  return result.data;
}
