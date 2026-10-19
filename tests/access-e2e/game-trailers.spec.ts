import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { signedSessionCookie } from "../helpers/access-session";
const exec = promisify(execFile);
async function fixture(command: string, argument?: string) {
  const { stdout } = await exec(
    process.execPath,
    [
      "--conditions=react-server",
      "--import",
      "tsx",
      "tests/helpers/access-browser-fixture.ts",
      command,
      ...(argument ? [argument] : []),
    ],
    { env: process.env, timeout: 10000 },
  );
  return JSON.parse(stdout.trim());
}
async function signIn(
  context: BrowserContext,
  role: "ADMIN" | "EDITOR" | "VIEWER" = "ADMIN",
) {
  const { token } = await fixture(
    "sign-in",
    JSON.stringify({ role, email: `${randomUUID()}@example.com` }),
  );
  await context.addCookies([
    {
      name: "__Secure-gemukore.session_token",
      value: signedSessionCookie(token, process.env.BETTER_AUTH_SECRET!),
      url: "https://127.0.0.1:3111",
      secure: true,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}
test.beforeEach(async () => {
  await fixture("reset-game-creation");
  await fixture("reset");
});
test.afterAll(async () => {
  await fixture("reset-game-creation");
  await fixture("reset");
});
const next = (page: Page) =>
  page.getByRole("button", { name: "Continue", exact: true }).click();
async function create(page: Page) {
  await page.goto("/app/games/new");
  await page.getByRole("option", { name: "Select SNES", exact: true }).click();
  await next(page);
  await page
    .getByRole("option", {
      name: "Select Chrono Trigger (chrono-trigger)",
      exact: true,
    })
    .click();
  await next(page);
  await page
    .getByRole("option", {
      name: "Select Standard Edition (chrono-snes-na)",
      exact: true,
    })
    .click();
  await next(page);
  await next(page);
  await page.getByRole("button", { name: "Save game", exact: true }).click();
  await page.getByRole("link", { name: "View game", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Chrono Trigger", level: 1 }),
  ).toBeVisible();
  return page.url();
}

const videoId = "AbCdEf123_-";
async function save(page: Page, value: string, provider = "YOUTUBE") {
  await page
    .getByLabel("Video provider", { exact: true })
    .selectOption(provider);
  await page.getByLabel("Video reference", { exact: true }).fill(value);
  await page.getByRole("button", { name: "Save trailer", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Trailer saved." }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Save trailer", exact: true }),
  ).toBeEnabled();
}
test("admin saves scoped trailers and players defer all external requests until opened", async ({
  page,
  context,
}, info) => {
  test.setTimeout(90_000);
  const data = await fixture("seed-game-creation");
  await signIn(context);
  const copyUrl = await create(page);
  await expect(page.getByText("No trailer recorded.")).toBeVisible();
  let youtubeRequests = 0;
  await context.route("https://www.youtube-nocookie.com/**", async (route) => {
    youtubeRequests++;
    expect(route.request().headers().referer).toBe("https://127.0.0.1:3111/");
    await route.fulfill({
      contentType: "text/html",
      body: '<html lang="en"><body><button>Video controls fixture</button></body></html>',
    });
  });
  await page.goto(`/app/catalog/games?kind=game&id=${data.gameId}`);
  await page.getByRole("link", { name: "Manage trailer", exact: true }).click();
  await save(page, `https://youtu.be/${videoId}?si=discarded`);
  expect(youtubeRequests).toBe(0);
  await page.goto(copyUrl);
  await page.getByRole("link", { name: "Trailer", exact: true }).click();
  await expect(
    page.getByText("Game-level trailer; this release has no trailer override."),
  ).toBeVisible();
  expect(youtubeRequests).toBe(0);
  expect(await page.locator("iframe,video").count()).toBe(0);
  const trigger = page.getByRole("button", {
    name: "Load trailer",
    exact: true,
  });
  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("iframe")).toHaveAttribute(
    "src",
    `https://www.youtube-nocookie.com/embed/${videoId}?playsinline=1`,
  );
  await expect.poll(() => youtubeRequests).toBe(1);
  await expect(
    page
      .frameLocator("iframe")
      .getByRole("button", { name: "Video controls fixture" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Close trailer", exact: true })
    .click();
  await expect(page.locator("iframe")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Load trailer", exact: true }),
  ).toBeFocused();
  await page
    .getByRole("link", { name: "Manage release trailer", exact: true })
    .click();
  // Generate a short silent video in Chromium for a real native decode/playback check.
  const bytes = await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const drawing = canvas.getContext("2d")!;
    const stream = canvas.captureStream(10);
    const chunks: Blob[] = [];
    const recorder = new MediaRecorder(stream, {
      mimeType: "video/webm;codecs=vp8",
    });
    const result = new Promise<number[]>((resolve) => {
      recorder.onstop = async () => {
        resolve(
          Array.from(new Uint8Array(await new Blob(chunks).arrayBuffer())),
        );
      };
    });
    recorder.ondataavailable = (event) => chunks.push(event.data);
    recorder.start();
    drawing.fillStyle = "#777777";
    drawing.fillRect(0, 0, 64, 64);
    await new Promise((resolve) => setTimeout(resolve, 500));
    recorder.stop();
    stream.getTracks().forEach((track) => track.stop());
    return result;
  });
  let videoRequests = 0;
  await context.route("https://video.example.test/trailer.webm", (route) => {
    videoRequests++;
    return route.fulfill({
      contentType: "video/webm",
      body: Buffer.from(bytes),
    });
  });
  await save(page, "https://video.example.test/trailer.webm", "DIRECT_URL");
  await page.goto(copyUrl);
  await page.getByRole("link", { name: "Trailer", exact: true }).click();
  await expect(page.getByText("Trailer for this release.")).toBeVisible();
  expect(videoRequests).toBe(0);
  await page.getByRole("button", { name: "Load trailer", exact: true }).click();
  const video = page.locator("video");
  await expect(video).toHaveAttribute("controls", "");
  await expect(video).toHaveAttribute("preload", "none");
  await expect(video).not.toHaveAttribute("autoplay");
  expect(videoRequests).toBe(0);
  await video.evaluate(async (video) => {
    await (video as HTMLVideoElement).play();
  });
  await expect
    .poll(() =>
      video.evaluate((video) => (video as HTMLVideoElement).readyState),
    )
    .toBeGreaterThanOrEqual(2);
  expect(videoRequests).toBeGreaterThan(0);
  await page.screenshot({
    path: info.outputPath("game-trailer-direct.png"),
    fullPage: true,
  });
  await page
    .getByRole("link", { name: "Manage release trailer", exact: true })
    .click();
  await save(page, "", "DIRECT_URL");
  await page.goto(copyUrl);
  await expect(
    page.getByRole("link", { name: "Watch on YouTube", exact: true }),
  ).toHaveAttribute("href", `https://www.youtube.com/watch?v=${videoId}`);
  await expect(
    page.getByText("Game-level trailer; this release has no trailer override."),
  ).toBeVisible();
});
test("rejects iframe HTML and unsafe URLs and keeps stale unsaved references", async ({
  page,
  context,
}) => {
  test.setTimeout(60_000);
  const data = await fixture("seed-game-creation");
  await signIn(context);
  await page.goto(
    `/app/catalog/games/trailer?kind=release&id=${data.releaseId}`,
  );
  await page
    .getByLabel("Video reference", { exact: true })
    .fill('<iframe src="https://evil.test"></iframe>');
  await page.getByRole("button", { name: "Save trailer", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Use a YouTube video ID" }),
  ).toBeFocused();
  await page
    .getByLabel("Video provider", { exact: true })
    .selectOption("DIRECT_URL");
  await page
    .getByLabel("Video reference", { exact: true })
    .fill("javascript:alert(1)");
  await page.getByRole("button", { name: "Save trailer", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "HTTPS video URL" }),
  ).toBeFocused();
  const other = await context.newPage();
  await other.goto(page.url());
  await other
    .getByLabel("Video reference", { exact: true })
    .fill("XyZ123AbC_-");
  await save(page, videoId);
  await other
    .getByRole("button", { name: "Save trailer", exact: true })
    .click();
  await expect(
    other.getByRole("alert").filter({ hasText: "catalog record changed" }),
  ).toBeFocused();
  await expect(
    other.getByLabel("Video reference", { exact: true }),
  ).toHaveValue("XyZ123AbC_-");
  await other.close();
});
test("viewers use a narrow reduced-motion player while catalog management stays restricted", async ({
  page,
  context,
}, info) => {
  test.setTimeout(60_000);
  const data = await fixture("seed-game-creation");
  await signIn(context);
  const copyUrl = await create(page);
  await page.goto(
    `/app/catalog/games/trailer?kind=release&id=${data.releaseId}`,
  );
  await save(page, videoId);
  await context.clearCookies();
  await signIn(context, "EDITOR");
  await page.goto(
    `/app/catalog/games/trailer?kind=release&id=${data.releaseId}`,
  );
  await expect(page).toHaveURL(/\/access-denied$/);
  await context.clearCookies();
  await signIn(context, "VIEWER");
  await page.setViewportSize({ width: 320, height: 720 });
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await context.addInitScript(() => {
    localStorage.setItem("gemukore-theme", "dark");
  });
  await context.route("https://www.youtube-nocookie.com/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: '<html><body style="background:#222;color:white">Trailer fixture</body></html>',
    }),
  );
  await page.goto(copyUrl);
  await expect(
    page.getByRole("link", { name: "Manage release trailer", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("link", { name: "Trailer", exact: true }).click();
  await page.getByRole("button", { name: "Load trailer", exact: true }).click();
  await expect(page.locator("iframe")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("game-trailer-mobile-dark.png"),
    fullPage: true,
  });
  await context.clearCookies();
  await page.goto(copyUrl);
  await expect(page).toHaveURL(/\/login$/);
});
