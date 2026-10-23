import { devices, expect, test } from "@playwright/test";
import { gzipSync } from "node:zlib";
import {
  fixture,
  openModel,
  prepareModel,
  signIn,
} from "../helpers/model-browser";
import { threeChunks } from "../../scripts/lib/three-bundle";

test.beforeEach(async () => {
  await fixture("reset-public");
  await fixture("reset-game-creation");
  await fixture("reset");
});
test.afterAll(async () => {
  await fixture("reset-public");
  await fixture("reset-game-creation");
  await fixture("reset");
});

test("@performance records cold-context route payloads and navigation work without imposing invented latency budgets", async ({
  browser,
  context,
}, info) => {
  test.setTimeout(120000);
  const data = await fixture("seed-public-detail");
  await signIn(context, "ADMIN");
  const cookies = await context.cookies();
  const renderer = new Set((await threeChunks()).map((chunk) => chunk.path));
  const observations = [];
  const paths = [
    "/collection",
    "/collection/consoles",
    `/collection/consoles/${data.ids[0]}`,
    "/app",
    "/app/collection",
    "/app/consoles/new",
    `/app/consoles/${data.ids[0]}`,
    `/app/games/${data.ids[1]}`,
  ];
  for (const [route, path] of paths.entries())
    for (let sample = 0; sample < 3; sample++) {
      const isolated = await browser.newContext({
        ...devices[
          info.project.name === "chromium" ? "Desktop Chrome" : "Pixel 7"
        ],
        baseURL: "https://127.0.0.1:3111",
        ignoreHTTPSErrors: true,
      });
      try {
        if (path.startsWith("/app")) await isolated.addCookies(cookies);
        const page = await isolated.newPage();
        const session = await isolated.newCDPSession(page);
        await session.send("Performance.enable");
        const scripts = new Map<string, { raw: number; gzip: number }>();
        const pending: Promise<void>[] = [];
        page.on("response", (response) => {
          const url = new URL(response.url());
          if (url.pathname.endsWith(".js"))
            pending.push(
              (async () => {
                const bytes = await response.body();
                scripts.set(url.pathname, {
                  raw: bytes.length,
                  gzip: gzipSync(bytes).length,
                });
              })(),
            );
        });
        const navigation = await page.goto(path);
        expect(navigation?.status()).toBe(200);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        const interactiveStart = performance.now();
        await page
          .getByRole("button", { name: "Choose theme", exact: true })
          .click();
        await expect(page.getByRole("menu")).toBeVisible();
        const themeActionMs = performance.now() - interactiveStart;
        await page.keyboard.press("Escape");
        // A bounded settled-window sample includes normal link prefetch activity.
        await page.waitForLoadState("networkidle");
        await Promise.all(pending);
        const html = await navigation!.body();
        const timings = await page.evaluate(() => {
          const nav = performance.getEntriesByType(
            "navigation",
          )[0] as PerformanceNavigationTiming;
          const resources = performance.getEntriesByType(
            "resource",
          ) as PerformanceResourceTiming[];
          return {
            ttfbMs: nav.responseStart,
            domContentLoadedMs: nav.domContentLoadedEventEnd,
            loadMs: nav.loadEventEnd,
            resourceTransferBytes: resources.reduce(
              (sum, entry) => sum + entry.transferSize,
              0,
            ),
            fontRequests: resources.filter((entry) =>
              /\.(woff2?|ttf)(\?|$)/.test(entry.name),
            ).length,
            imageRequests: resources.filter(
              (entry) => entry.initiatorType === "img",
            ).length,
          };
        });
        const metrics = await session.send("Performance.getMetrics");
        const browserWork = Object.fromEntries(
          metrics.metrics
            .filter((entry) =>
              [
                "ScriptDuration",
                "TaskDuration",
                "JSHeapUsedSize",
                "Nodes",
              ].includes(entry.name),
            )
            .map((entry) => [entry.name, entry.value]),
        );
        expect([...scripts.keys()].filter((url) => renderer.has(url))).toEqual(
          [],
        );
        await expect(page.locator("canvas")).toHaveCount(0);
        observations.push({
          route: paths[route]
            .replace(data.ids[0], "[console-id]")
            .replace(data.ids[1], "[game-id]"),
          sample,
          ...timings,
          themeActionMs,
          htmlRawBytes: html.length,
          htmlGzipBytes: gzipSync(html).length,
          jsRequests: scripts.size,
          jsRawBytes: [...scripts.values()].reduce(
            (sum, item) => sum + item.raw,
            0,
          ),
          jsGzipEstimateBytes: [...scripts.values()].reduce(
            (sum, item) => sum + item.gzip,
            0,
          ),
          browserWork,
          chunks: [...scripts.keys()],
        });
      } finally {
        await isolated.close();
      }
    }
  await info.attach("route-performance", {
    body: JSON.stringify(
      {
        project: info.project.name,
        note: "Three fresh contexts per route, warm local production server, no CPU/network throttling. Timings are observations, not SLO assertions. gzip bytes are recompressed estimates, not wire bytes.",
        observations,
      },
      null,
      2,
    ),
    contentType: "application/json",
  });
});

test("@performance records incremental lazy renderer cost and ready time on real uploaded geometry", async ({
  page,
  context,
}, info) => {
  const chunks = await threeChunks();
  const renderer = new Set(chunks.map((chunk) => chunk.path));
  const { viewer } = await prepareModel(page, context);
  await page.emulateMedia({ reducedMotion: "reduce" });
  const requested = new Set<string>();
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (renderer.has(path)) requested.add(path);
  });
  expect(requested.size).toBe(0);
  const start = performance.now();
  await openModel(page);
  const readyMs = performance.now() - start;
  expect(requested.size).toBeGreaterThan(0);
  await viewer
    .getByRole("button", { name: "Close 3D preview", exact: true })
    .click();
  await expect(page.locator("canvas")).toHaveCount(0);
  await info.attach("lazy-renderer-performance", {
    body: JSON.stringify(
      {
        project: info.project.name,
        readyMs,
        chunks: chunks.filter((chunk) => requested.has(chunk.path)),
      },
      null,
      2,
    ),
    contentType: "application/json",
  });
});
