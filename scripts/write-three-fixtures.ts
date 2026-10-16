import { mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";
import { modelBenchmark } from "../tests/helpers/model-benchmarks";
async function main() {
  const directory = resolve(process.argv[2] ?? "test-results/three-fixtures");
  await mkdir(directory, { recursive: true });
  for (const kind of ["plain", "shiny", "textured"] as const) {
    const model = modelBenchmark(kind),
      path = join(directory, `${kind}.glb`);
    await writeFile(path, model.bytes);
    console.log(
      JSON.stringify({
        path,
        byteLength: model.bytes.length,
        triangles: model.triangles,
        pixels: model.pixels,
        sha256: createHash("sha256").update(model.bytes).digest("hex"),
        source: "Original GemuKore synthetic study; not catalog data.",
      }),
    );
  }
}
void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "3D tooling failed");
  process.exitCode = 1;
});
