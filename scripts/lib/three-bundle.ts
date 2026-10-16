import { readFile, readdir } from "node:fs/promises";
import { join, sep } from "node:path";
import { gzipSync } from "node:zlib";
// Deliberate sentinels from the pinned loader/renderer. Reassess after vendor upgrades.
export async function threeChunks(directory = ".next/static/chunks") {
  const files = await readdir(directory, { recursive: true });
  const chunks = [];
  for (const file of files) {
    if (!file.endsWith(".js")) continue;
    const bytes = await readFile(join(directory, file));
    if (
      !bytes.includes(Buffer.from("GemuKoreResourceOwner")) &&
      !bytes.includes(Buffer.from("THREE.WebGLRenderer"))
    )
      continue;
    chunks.push({
      path: `/_next/static/chunks/${file.split(sep).join("/")}`,
      rawBytes: bytes.length,
      gzipBytes: gzipSync(bytes).length,
    });
  }
  if (!chunks.length)
    throw new Error(
      "No renderer/loader chunk found. Build first or review the vendor sentinels.",
    );
  return chunks;
}
export const threeBundleLimits = {
  rawBytes: 1280 * 1024,
  gzipBytes: 320 * 1024,
};
