import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { execFileSync } from "node:child_process";
const cases = [
  "deferred-bundle.json",
  "idle-rendering.json",
  "drawing-buffer.json",
  "orientation-layout.json",
  "stable-drawing-buffer.json",
  "loading-states.json",
  "late-decoder.json",
  "benchmark-plain.json",
  "benchmark-shiny.json",
  "benchmark-textured.json",
];
async function main() {
  const root = resolve("test-results"),
    reports: { case: string; project: string; [key: string]: unknown }[] = [];
  for (const path of await readdir(root, { recursive: true })) {
    const name = basename(path);
    if (!cases.includes(name)) continue;
    const report = JSON.parse(await readFile(resolve(root, path), "utf8"));
    reports.push({ case: name, ...report });
  }
  for (const name of cases)
    for (const project of ["chromium", "mobile-chromium"]) {
      if (
        reports.filter(
          (report) => report.case === name && report.project === project,
        ).length !== 1
      )
        throw new Error(
          `Expected one ${project} result for ${name}; run the complete performance suite successfully first.`,
        );
    }
  const path = resolve(
    process.argv[2] ?? "docs/performance/3D_PERFORMANCE_EVIDENCE.json",
  );
  await mkdir(dirname(path), { recursive: true });
  await writeFile(
    path,
    JSON.stringify(
      {
        schemaVersion: 1,
        recordedAt: new Date().toISOString(),
        source: {
          baseCommit: execFileSync("git", ["rev-parse", "HEAD"], {
            encoding: "utf8",
          }).trim(),
          includesUncommittedTaskChanges: Boolean(
            execFileSync("git", ["status", "--porcelain"], {
              encoding: "utf8",
            }).trim(),
          ),
        },
        environment:
          "Instrumented automated Chromium on the test host. Mobile project emulates a viewport and user agent; these are not physical-phone GPU measurements.",
        physicalDevices: {
          iosSafari:
            "iPhone observations recorded; native-memory stability remains inconclusive. See 3D_PERFORMANCE_IPHONE15.json.",
          androidChrome:
            "physical testing waived by owner 2026-10-16; compatibility assumed, not verified",
        },
        reports: reports.sort((a, b) =>
          `${a.project}/${a.case}`.localeCompare(`${b.project}/${b.case}`),
        ),
      },
      null,
      2,
    ) + "\n",
  );
  console.log(`Recorded ${reports.length} performance results in ${path}`);
}
void main().catch((error: unknown) => {
  console.error(
    error instanceof Error
      ? error.message
      : "Could not collect performance evidence",
  );
  process.exitCode = 1;
});
