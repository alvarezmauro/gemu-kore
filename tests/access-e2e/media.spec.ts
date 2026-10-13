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
    { env: process.env, timeout: 10_000 },
  );
  return JSON.parse(stdout.trim());
}
async function signIn(
  context: BrowserContext,
  role: "EDITOR" | "VIEWER" = "EDITOR",
) {
  const { token } = await fixture("sign-in", JSON.stringify({ role }));
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

import { monochromePng } from "../helpers/png-fixtures";
async function upload(page: Page, names = ["front.png"], camera = false) {
  await page
    .getByLabel(camera ? "Camera photo" : "Photo files", { exact: true })
    .setInputFiles(
      names.map((name) => ({
        name,
        mimeType: "image/png",
        buffer: monochromePng(120, 80),
      })),
    );
  await expect(page.getByText("Saved privately", { exact: true })).toHaveCount(
    names.length,
  );
  await expect(
    page.getByRole("button", { name: "Choose photos", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole("list", { name: "Photo gallery" }).getByRole("listitem"),
  ).toHaveCount(names.length);
}
const gallery = (page: Page) =>
  page.getByRole("list", { name: "Photo gallery", exact: true });
test.beforeEach(async () => {
  await fixture("reset-media");
  await fixture("reset");
});
test.afterAll(async () => {
  await fixture("reset-media");
  await fixture("reset");
});
test("shows an empty collection without offering detached photo creation", async ({
  page,
  context,
}) => {
  await signIn(context);
  await page.goto("/app");
  await page.getByRole("link", { name: "Manage photos" }).click();
  await expect(
    page.getByRole("heading", { name: "No collection items yet" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Choose photos" })).toHaveCount(
    0,
  );
});
test("uploads actual images privately, edits classification and description, inspects then removes a use", async ({
  page,
  context,
}, testInfo) => {
  await signIn(context);
  const { firstId } = await fixture("seed-defect-items");
  await page.goto(`/app/media?itemId=${firstId}`);
  await page.getByLabel("Photo classification").selectOption("BOX");
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await upload(page);
  const [record] = await fixture("media-records", firstId);
  expect(record.type).toBe("BOX");
  expect(record.publicApproved).toBe(false);
  expect(await fixture("asset-count")).toBe(3);
  const image = gallery(page).getByRole("img");
  await expect(image).toBeVisible();
  expect(
    await image.evaluate((node) => (node as HTMLImageElement).naturalWidth),
  ).toBeGreaterThan(0);
  const source = await image.getAttribute("src");
  const read = await page.request.get(source!);
  expect(read.status()).toBe(200);
  expect(read.headers()["cache-control"]).toContain("no-store");
  expect(read.headers()["content-type"]).toBe("image/webp");
  await page.getByRole("button", { name: "Edit photo 1" }).click();
  await page
    .getByLabel("Classification", { exact: true })
    .selectOption("SERIAL");
  await page
    .getByLabel("Caption", { exact: true })
    .fill("Serial label on my copy");
  await page
    .getByLabel("Image description", { exact: true })
    .fill("White serial label on the underside");
  await page.getByRole("button", { name: "Save photo", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    gallery(page).getByText("Serial number", { exact: true }),
  ).toBeVisible();
  await expect(gallery(page).getByRole("img")).toHaveAttribute(
    "alt",
    "White serial label on the underside",
  );
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: testInfo.outputPath("collection-photos.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "View photo 1" }).click();
  const dialog = page.getByRole("dialog");
  const displaySrc = await dialog.getByRole("img").getAttribute("src");
  expect(displaySrc).not.toBe(source);
  await expect(dialog.getByRole("img")).toBeVisible();
  await page.getByRole("button", { name: "Close photo", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "View photo 1" }),
  ).toBeFocused();
  await page.getByRole("button", { name: "Remove photo 1" }).click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(await fixture("media-records", firstId)).toHaveLength(1);
  await page.getByRole("button", { name: "Remove photo 1" }).click();
  await page.getByRole("button", { name: "Remove photo", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "No photos for this copy" }),
  ).toBeVisible();
  expect(await fixture("asset-count")).toBe(3);
  await expect(
    page.getByRole("heading", { name: "Photos (0)", exact: true }),
  ).toBeFocused();
  expect((await page.request.get(source!)).status()).toBe(200);
  expect(errors).toEqual([]);
});
test("uploads a batch sequentially and persists button reordering without crossing copies", async ({
  page,
  context,
}) => {
  await signIn(context);
  const { firstId, secondId } = await fixture("seed-defect-items");
  await page.goto(`/app/media?itemId=${firstId}`);
  await upload(page, ["first.png", "second.png", "third.png"]);
  const before = await fixture("media-records", firstId);
  expect(
    before.map((record: { sortOrder: number }) => record.sortOrder),
  ).toEqual([0, 1, 2]);
  await page.getByRole("button", { name: "Move photo 3 earlier" }).click();
  await expect(
    page.getByText("Photo order saved.", { exact: true }),
  ).toBeVisible();
  const after = await fixture("media-records", firstId);
  expect(after.map((record: { id: string }) => record.id)).toEqual([
    before[0].id,
    before[2].id,
    before[1].id,
  ]);
  await page.getByLabel("Collection copy").selectOption(secondId);
  await page.getByRole("button", { name: "View copy", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "No photos for this copy" }),
  ).toBeVisible();
  expect(await fixture("media-records", secondId)).toEqual([]);
});
test("drags with a mouse or touch handle and persists the new order", async ({
  page,
  context,
}, testInfo) => {
  await signIn(context);
  const { firstId } = await fixture("seed-defect-items");
  await page.goto(`/app/media?itemId=${firstId}`);
  await upload(page, ["first.png", "second.png"]);
  const before = await fixture("media-records", firstId);
  const handle = page.getByRole("button", { name: "Drag photo 1" });
  await handle.scrollIntoViewIfNeeded();
  const source = await handle.boundingBox();
  const target = await gallery(page).getByRole("listitem").nth(1).boundingBox();
  expect(source).not.toBeNull();
  expect(target).not.toBeNull();
  const start = {
    x: source!.x + source!.width / 2,
    y: source!.y + source!.height / 2,
  };
  const end = {
    x: target!.x + target!.width / 2,
    y: Math.max(10, target!.y + 10),
  };
  if (testInfo.project.name === "mobile-chromium") {
    const session = await context.newCDPSession(page);
    await session.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [start],
    });
    for (let i = 1; i <= 10; i++)
      await session.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [
          {
            x: start.x + ((end.x - start.x) * i) / 10,
            y: start.y + ((end.y - start.y) * i) / 10,
          },
        ],
      });
    await session.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await session.detach();
  } else {
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 10 });
    await page.mouse.up();
  }
  await expect(
    page.getByText("Photo order saved.", { exact: true }),
  ).toBeVisible();
  expect(
    (await fixture("media-records", firstId)).map(
      (record: { id: string }) => record.id,
    ),
  ).toEqual([before[1].id, before[0].id]);
});
test("uses the separate camera input and stays within a narrow mobile viewport", async ({
  page,
  context,
}) => {
  await signIn(context);
  const { consoleId } = await fixture("seed-defect-items");
  await page.goto(`/app/media?itemId=${consoleId}`);
  await expect(
    page.getByLabel("Camera photo", { exact: true }),
  ).toHaveAttribute("capture", "environment");
  await expect(
    page.getByLabel("Photo files", { exact: true }),
  ).not.toHaveAttribute("capture");
  await upload(page, ["camera.png"], true);
  await page.setViewportSize({ width: 320, height: 740 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
test("rejects unsupported and unreadable images without attaching a photo", async ({
  page,
  context,
}) => {
  await signIn(context);
  const { firstId } = await fixture("seed-defect-items");
  await page.goto(`/app/media?itemId=${firstId}`);
  await page.getByLabel("Photo files", { exact: true }).setInputFiles({
    name: "camera.heic",
    mimeType: "image/heic",
    buffer: Buffer.from("bad"),
  });
  await expect(
    page.getByText(/Choose a JPEG, PNG, WebP or AVIF image/),
  ).toBeVisible();
  expect(await fixture("asset-count")).toBe(0);
  await page.getByLabel("Photo files", { exact: true }).setInputFiles({
    name: "bad.png",
    mimeType: "image/png",
    buffer: Buffer.from("bad"),
  });
  await expect(
    page.getByText(
      "This image could not be read. Choose a supported, single-frame image.",
    ),
  ).toBeVisible();
  expect(await fixture("media-records", firstId)).toEqual([]);
});
test("rejects a stale edit, retains the caption and lets the user refresh", async ({
  page,
  context,
}) => {
  await signIn(context);
  const { firstId } = await fixture("seed-defect-items");
  await page.goto(`/app/media?itemId=${firstId}`);
  await upload(page);
  const other = await context.newPage();
  await other.goto(`/app/media?itemId=${firstId}`);
  await page.getByRole("button", { name: "Edit photo 1" }).click();
  await page.getByLabel("Caption", { exact: true }).fill("Stale change");
  await other.getByRole("button", { name: "Edit photo 1" }).click();
  await other.getByLabel("Caption", { exact: true }).fill("Saved elsewhere");
  await other.getByRole("button", { name: "Save photo", exact: true }).click();
  await expect(other.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Save photo", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("This copy changed");
  await expect(page.getByLabel("Caption", { exact: true })).toHaveValue(
    "Stale change",
  );
  const [record] = await fixture("media-records", firstId);
  expect(record.caption).toBe("Saved elsewhere");
  await other.close();
});
test("lets viewers inspect images and denies direct delivery after access revocation", async ({
  page,
  context,
}) => {
  await signIn(context);
  const { firstId } = await fixture("seed-defect-items");
  await page.goto(`/app/media?itemId=${firstId}`);
  await upload(page);
  const src = await gallery(page).getByRole("img").getAttribute("src");
  await fixture("update", JSON.stringify({ role: "VIEWER" }));
  await page.reload();
  await expect(gallery(page).getByRole("img")).toBeVisible();
  await expect(page.getByRole("button", { name: "Choose photos" })).toHaveCount(
    0,
  );
  await expect(page.getByRole("button", { name: "Edit photo 1" })).toHaveCount(
    0,
  );
  await fixture("update", JSON.stringify({ enabled: false }));
  expect((await page.request.get(src!)).status()).toBe(403);
  await page.goto(`/app/media?itemId=${firstId}`);
  await expect(page).toHaveURL(/access-denied/);
});
test("redirects anonymous media management and rejects malformed copy selections", async ({
  page,
  context,
}) => {
  await page.goto("/app/media");
  await expect(page).toHaveURL(/login/);
  await signIn(context);
  await page.goto("/app/media?itemId=bad");
  await expect(page.getByRole("heading", { name: "404" })).toBeVisible();
});

test("keeps long captions and edit forms usable at 320px in dark mode with reduced motion", async ({
  page,
  context,
}, testInfo) => {
  await signIn(context);
  const { firstId } = await fixture("seed-defect-items");
  await page.goto(`/app/media?itemId=${firstId}`);
  await upload(page);
  await page.setViewportSize({ width: 320, height: 740 });
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.reload();
  await page.getByRole("button", { name: "Edit photo 1" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Caption", { exact: true }).fill("A".repeat(2000));
  await dialog
    .getByLabel("Image description", { exact: true })
    .fill("A detailed photo description");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await dialog.getByRole("button", { name: "Save photo", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(gallery(page)).toContainText("A".repeat(2000));
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: testInfo.outputPath("photos-320px-dark.png"),
    fullPage: true,
  });
});
