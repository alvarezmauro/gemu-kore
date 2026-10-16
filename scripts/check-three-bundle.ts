import { threeBundleLimits, threeChunks } from "./lib/three-bundle";
async function main() {
  const chunks = await threeChunks();
  const totals = chunks.reduce(
    (sum, chunk) => ({
      rawBytes: sum.rawBytes + chunk.rawBytes,
      gzipBytes: sum.gzipBytes + chunk.gzipBytes,
    }),
    { rawBytes: 0, gzipBytes: 0 },
  );
  console.log(
    JSON.stringify({ chunks, totals, limits: threeBundleLimits }, null, 2),
  );
  if (
    totals.rawBytes > threeBundleLimits.rawBytes ||
    totals.gzipBytes > threeBundleLimits.gzipBytes
  ) {
    console.error(
      "The deferred renderer/loader exceeds its bundle regression budget.",
    );
    process.exitCode = 1;
  }
}
void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "3D tooling failed");
  process.exitCode = 1;
});
