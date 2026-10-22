import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { signedSessionCookie } from "../helpers/access-session";
import { monochromePng } from "../helpers/png-fixtures";
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
  role: "ADMIN" | "EDITOR" | "VIEWER" = "EDITOR",
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
test.beforeEach(async () => {
  await fixture("reset-search");
  await fixture("reset");
});
test.afterAll(async () => {
  await fixture("reset-search");
  await fixture("reset");
});
const next = (page: Page) =>
  page.getByRole("button", { name: "Continue", exact: true }).click();
async function physical(
  page: Page,
  platform = "PlayStation",
  model = "SCPH-1000",
) {
  await page
    .getByRole("option", { name: `Select ${platform}`, exact: true })
    .click();
  await next(page);
  if (platform === "PlayStation")
    await page
      .getByRole("option", { name: `Select ${model}`, exact: true })
      .click();
  await next(page);
}
function glb() {
  const raw = Buffer.from(
    JSON.stringify({ asset: { version: "2.0" }, scenes: [{}], scene: 0 }),
  );
  const json = Buffer.concat([
    raw,
    Buffer.alloc((4 - (raw.length % 4)) % 4, 32),
  ]);
  const bytes = Buffer.alloc(20 + json.length);
  bytes.writeUInt32LE(0x46546c67, 0);
  bytes.writeUInt32LE(2, 4);
  bytes.writeUInt32LE(bytes.length, 8);
  bytes.writeUInt32LE(json.length, 12);
  bytes.writeUInt32LE(0x4e4f534a, 16);
  json.copy(bytes, 20);
  return bytes;
}
test("@critical editor creates a private console, defects, photo and both copy-only overrides", async ({
  page,
  context,
}, info) => {
  await signIn(context);
  const data = await fixture("seed-console-creation");
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/app/collection");
  await page.getByRole("link", { name: "Add console", exact: true }).click();
  await page.getByRole("combobox", { name: "Find consoles" }).fill("psx");
  await page.getByRole("combobox", { name: "Find consoles" }).press("Enter");
  await expect(
    page.getByRole("option", { name: "Select PlayStation", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Find matches" }),
  ).toBeEnabled();
  await page
    .getByRole("combobox", { name: "Find consoles" })
    .press("ArrowDown");
  await page.getByRole("combobox", { name: "Find consoles" }).press("Enter");
  await expect(
    page.getByRole("status").filter({ hasText: "Selected: PlayStation" }),
  ).toBeVisible();
  await next(page);
  const modelSearch = page.getByRole("combobox", { name: "Find models" });
  await modelSearch.fill("SCPH");
  await modelSearch.press("Enter");
  await expect(
    page.getByRole("option", { name: "Select SCPH-1000", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Find matches" }),
  ).toBeEnabled();
  await modelSearch.press("ArrowDown");
  await modelSearch.press("Enter");
  await next(page);
  await page.getByLabel("Serial number", { exact: true }).fill("00001");
  await page.getByLabel("Has box", { exact: true }).selectOption("yes");
  await page.getByLabel("Location", { exact: true }).selectOption(data.shelfId);
  await page
    .getByLabel("Observed markings or identification uncertainty")
    .fill("Replacement shell suspected");
  await page
    .getByLabel("Private notes", { exact: true })
    .fill("Childhood copy");
  await page.getByRole("button", { name: "Add defect" }).click();
  await page.getByLabel(/Defect 1 title/).fill("Yellowing");
  await page.getByLabel("Defect 1 severity").selectOption("COSMETIC");
  await next(page);
  const image = {
    name: "front.png",
    mimeType: "image/png",
    buffer: monochromePng(120, 80),
  };
  await page.getByLabel("Choose photos", { exact: true }).setInputFiles(image);
  expect(await fixture("asset-count")).toBe(0);
  await next(page);
  await page
    .getByLabel("Custom logo", { exact: true })
    .setInputFiles({ ...image, name: "logo.png" });
  await page.getByLabel("Custom 3D model", { exact: true }).setInputFiles({
    name: "console.glb",
    mimeType: "model/gltf-binary",
    buffer: glb(),
  });
  await next(page);
  await expect(
    page.getByRole("heading", { name: "Review", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Commercial markets: Japan", { exact: true }),
  ).toBeVisible();
  expect(await fixture("console-creation-state")).toEqual([]);
  await page.screenshot({
    path: info.outputPath("console-review.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Save console", exact: true }).click();
  await expect(page.getByText("Saved privately", { exact: true })).toHaveCount(
    3,
    { timeout: 20000 },
  );
  const copies = await fixture("console-creation-state");
  expect(copies).toMatchObject([
    {
      serialNumber: "00001",
      publicationStatus: "PRIVATE",
      locationId: data.shelfId,
      hasBox: true,
      observedMarkings: "Replacement shell suspected",
      notes: "Childhood copy",
      ownedConsole: { consoleModelId: data.modelId },
      defects: [{ title: "Yellowing", severity: "COSMETIC" }],
    },
  ]);
  expect(copies[0].media).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ type: "PHOTO", publicApproved: false }),
      expect.objectContaining({
        type: "CUSTOM_LOGO",
        isPrimary: true,
        publicApproved: false,
      }),
      expect.objectContaining({
        type: "CUSTOM_MODEL",
        isPrimary: true,
        publicApproved: false,
      }),
    ]),
  );
  expect(errors).toEqual([]);
  await page
    .getByRole("link", { name: "Browse collection", exact: true })
    .last()
    .click();
  await expect(
    page.getByRole("heading", { name: "PlayStation", exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/SCPH-1000 · Japan · Copy/)).toBeVisible();
});
test("automatically selects a sole model, keeps unknown values, and supports two copies", async ({
  page,
  context,
}) => {
  await signIn(context, "ADMIN");
  await fixture("seed-console-creation");
  for (let index = 0; index < 2; index++) {
    await page.goto("/app/consoles/new");
    await physical(page, "Nintendo Entertainment System");
    await expect(page.getByLabel("Has box", { exact: true })).toHaveValue(
      "unknown",
    );
    await next(page);
    await next(page);
    await next(page);
    await page
      .getByRole("button", { name: "Save console", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Console saved privately" }),
    ).toBeVisible();
  }
  const copies = await fixture("console-creation-state");
  expect(copies).toHaveLength(2);
  expect(copies[0]).toMatchObject({
    hasBox: null,
    serialNumber: null,
    locationId: null,
  });
  expect(copies[0].id).not.toBe(copies[1].id);
});
test("retains physical details when a catalog selection becomes stale before save", async ({
  page,
  context,
}) => {
  await signIn(context);
  const data = await fixture("seed-console-creation");
  await page.goto("/app/consoles/new");
  await physical(page);
  await page.getByLabel("Serial number", { exact: true }).fill("keep-this");
  await next(page);
  await next(page);
  await next(page);
  await fixture("change-console-model", data.modelId);
  await page.getByRole("button", { name: "Save console", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "changed" }),
  ).toBeVisible();
  expect(await fixture("console-creation-state")).toEqual([]);
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(page.getByLabel("Serial number", { exact: true })).toHaveValue(
    "keep-this",
  );
});
test("keeps a saved copy and stops the upload queue on an uncertain file response", async ({
  page,
  context,
}) => {
  await signIn(context);
  await fixture("seed-console-creation");
  await page.goto("/app/consoles/new");
  await physical(page);
  await next(page);
  await page.getByLabel("Choose photos", { exact: true }).setInputFiles([
    { name: "first.png", mimeType: "image/png", buffer: monochromePng(10, 10) },
    { name: "later.png", mimeType: "image/png", buffer: monochromePng(10, 10) },
  ]);
  let uploads = 0;
  await page.route("**/api/uploads", async (route) => {
    uploads++;
    await route.abort();
  });
  await next(page);
  await next(page);
  await page.getByRole("button", { name: "Save console", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Your console is saved" }),
  ).toBeVisible();
  expect(await fixture("console-creation-state")).toHaveLength(1);
  expect(uploads).toBe(1);
  await expect(
    page.getByRole("button", { name: "Upload remaining files" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Save console", exact: true }),
  ).toHaveCount(0);
});
test("viewers and anonymous visitors cannot enter console creation", async ({
  page,
  context,
}) => {
  await page.goto("/app/consoles/new");
  await expect(page).toHaveURL(/\/login$/);
  await signIn(context, "VIEWER");
  await page.goto("/app/collection");
  await expect(
    page.getByRole("link", { name: "Add console", exact: true }),
  ).toHaveCount(0);
  await page.goto("/app/consoles/new");
  await expect(page).toHaveURL(/\/access-denied$/);
});
test("shows empty choices and remains usable at 320px in dark reduced-motion mode", async ({
  page,
  context,
}, info) => {
  await signIn(context);
  await page.setViewportSize({ width: 320, height: 720 });
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.goto("/app/consoles/new");
  await expect(page.getByRole("status")).toContainText("No active consoles");
  await fixture("seed-console-creation");
  await page.reload();
  await page
    .getByRole("option", { name: "Select No hardware yet", exact: true })
    .click();
  await next(page);
  await expect(page.getByRole("status")).toContainText("No active models");
  expect(await fixture("console-creation-state")).toEqual([]);
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await physical(page);
  await page
    .getByLabel("Private notes", { exact: true })
    .fill("VeryLongPrivateCopyDescription".repeat(15));
  await next(page);
  await next(page);
  await next(page);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("console-review-mobile-dark.png"),
    fullPage: true,
  });
});
