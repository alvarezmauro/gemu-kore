import { mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";
import { jewelFixture } from "../tests/helpers/jewel-fixture";
import { clamshellFixture } from "../tests/helpers/clamshell-fixture";
import { modelBenchmark } from "../tests/helpers/model-benchmarks";
async function main() {
  const directory = resolve(process.argv[2] ?? "test-results/three-fixtures");
  await mkdir(directory, { recursive: true });
  const jewel = jewelFixture();
  await writeFile(
    join(directory, "synthetic-playstation-jewel.glb"),
    jewel.bytes,
  );
  await writeFile(
    join(directory, "synthetic-playstation-jewel-slots.json"),
    JSON.stringify(jewel.slots, null, 2) + "\n",
  );
  console.log(
    JSON.stringify({
      path: join(directory, "synthetic-playstation-jewel.glb"),
      byteLength: jewel.bytes.length,
      dimensions: jewel.dimensions,
      source:
        "Original synthetic jewel case; not retail measurements or catalog data.",
    }),
  );
  const clamshell = clamshellFixture();
  await writeFile(
    join(directory, "synthetic-genesis-clamshell.glb"),
    clamshell.bytes,
  );
  await writeFile(
    join(directory, "synthetic-genesis-clamshell-slots.json"),
    JSON.stringify(clamshell.slots, null, 2) + "\n",
  );
  console.log(
    JSON.stringify({
      path: join(directory, "synthetic-genesis-clamshell.glb"),
      byteLength: clamshell.bytes.length,
      dimensions: clamshell.dimensions,
      source:
        "Original synthetic clamshell; not retail measurements or catalog data.",
    }),
  );
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
