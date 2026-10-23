import { execFileSync } from "node:child_process";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { threeChunks, threeBundleLimits } from "./lib/three-bundle";

type Attachment = { name: string; body?: string; path?: string };
type Suite = {
  suites?: Suite[];
  specs?: {
    tests: { projectName: string; results: { attachments: Attachment[] }[] }[];
  }[];
};
async function main() {
  const input = process.argv[2];
  if (!input)
    throw new Error("Supply the successful Playwright JSON report path.");
  const report = JSON.parse(await readFile(input, "utf8")) as {
    stats: {
      unexpected: number;
      skipped: number;
      flaky: number;
      expected: number;
    };
    suites: Suite[];
  };
  if (report.stats.unexpected || report.stats.skipped || report.stats.flaky)
    throw new Error("Collect only a complete passing diagnostic browser run.");
  const evidence: { name: string; project: string; data: unknown }[] = [];
  async function visit(suites: Suite[]) {
    for (const suite of suites) {
      for (const spec of suite.specs ?? [])
        for (const test of spec.tests)
          for (const result of test.results)
            for (const attachment of result.attachments) {
              if (
                !["route-performance", "lazy-renderer-performance"].includes(
                  attachment.name,
                )
              )
                continue;
              const content = attachment.body
                ? Buffer.from(attachment.body, "base64").toString("utf8")
                : await readFile(attachment.path!, "utf8");
              evidence.push({
                name: attachment.name,
                project: test.projectName,
                data: JSON.parse(content),
              });
            }
      await visit(suite.suites ?? []);
    }
  }
  await visit(report.suites);
  for (const project of ["chromium", "mobile-chromium"])
    for (const name of ["route-performance", "lazy-renderer-performance"]) {
      if (
        evidence.filter(
          (item) => item.name === name && item.project === project,
        ).length !== 1
      )
        throw new Error(`Missing or duplicated ${project}/${name} evidence.`);
    }
  const inventory = [];
  const directory = ".next/static/chunks";
  for (const path of await readdir(directory, { recursive: true })) {
    if (!path.endsWith(".js")) continue;
    const bytes = await readFile(join(directory, path));
    inventory.push({
      path: `/_next/static/chunks/${path}`,
      rawBytes: bytes.length,
      gzipBytes: gzipSync(bytes).length,
    });
  }
  const boundaries = [];
  for (const route of [
    "collection/page",
    "collection/consoles/[id]/page",
    "app/page",
    "app/collection/page",
    "app/consoles/new/page",
    "app/consoles/[id]/page",
    "app/games/[id]/page",
  ]) {
    const text = await readFile(
      `.next/server/app/${route}_client-reference-manifest.js`,
      "utf8",
    );
    const marker = text.indexOf(' = {"moduleLoading"');
    if (marker < 0)
      throw new Error(
        "Review client-reference manifest format after bundler changes.",
      );
    const manifest = JSON.parse(
      text
        .slice(marker + 3)
        .trim()
        .replace(/;$/, ""),
    ) as { clientModules: Record<string, unknown> };
    boundaries.push({
      route,
      clientModules: Object.keys(manifest.clientModules)
        .filter((key) => key.includes("/src/"))
        .map((key) => key.split("/src/")[1]),
    });
  }
  const renderer = await threeChunks();
  const output = {
    schemaVersion: 1,
    recordedAt: new Date().toISOString(),
    sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim(),
    includesUncommittedChanges: Boolean(
      execFileSync("git", ["status", "--porcelain"], {
        encoding: "utf8",
      }).trim(),
    ),
    environment:
      "Local production Next.js, disposable PostgreSQL/MinIO, Chromium and emulated Pixel 7. Fresh browser contexts with no CPU/network throttling; synthetic small images/GLB. gzip estimates use Node's default compression. No physical-device or deployment SLO claim.",
    browserResults: report.stats,
    evidence,
    renderer: { chunks: renderer, limits: threeBundleLimits },
    largestBuildChunks: inventory
      .sort((a, b) => b.gzipBytes - a.gzipBytes)
      .slice(0, 12),
    boundaries,
  };
  await writeFile(
    process.argv[3] ?? "docs/performance/APPLICATION_BROWSER_EVIDENCE.json",
    JSON.stringify(output, null, 2) + "\n",
  );
  console.info("Recorded application browser and build evidence.");
}
void main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : "Performance report unavailable",
  );
  process.exitCode = 1;
});
