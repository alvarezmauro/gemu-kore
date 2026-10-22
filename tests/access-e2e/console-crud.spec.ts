import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { expect, test, type BrowserContext } from "@playwright/test";
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
async function seed() {
  const hardware = await fixture("seed-console-creation");
  const copies = await fixture("seed-console-copies", hardware.modelId);
  return { ...hardware, ...copies };
}
test.beforeEach(async () => {
  await fixture("reset-search");
  await fixture("reset");
});
test.afterAll(async () => {
  await fixture("reset-search");
  await fixture("reset");
});
test("opens individual console copies from collection/search and shows private/canonical facts separately", async ({
  page,
  context,
}, info) => {
  await signIn(context);
  const { id } = await seed();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/app/collection");
  await page
    .getByRole("link", {
      name: `View console PlayStation, copy ${id.slice(0, 8)}`,
      exact: true,
    })
    .click();
  await expect(page).toHaveURL(new RegExp(`/app/consoles/${id}$`));
  await expect(
    page.getByRole("heading", { name: "My Console", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("COPY-ONE", { exact: true })).toBeVisible();
  await expect(page.getByText("Childhood copy", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Console Information", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Japan", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Console identity preview" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Technical Specifications",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Gallery", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Catalog images", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Copy photos", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("navigation", { name: "Console page sections" })
    .getByRole("link", { name: "Technical Specifications" })
    .click();
  await expect(page).toHaveURL(
    new RegExp(`/app/consoles/${id}#console-specifications-title$`),
  );
  await expect(
    page
      .getByRole("region", { name: "My Console", exact: true })
      .getByText("Childhood copy"),
  ).toBeVisible();
  await expect(
    page
      .getByRole("region", { name: "Console Information", exact: true })
      .getByText("Childhood copy"),
  ).toHaveCount(0);

  await expect(
    page.getByRole("heading", { name: "Yellowing", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Manage copy photos" }),
  ).toHaveAttribute("href", `/app/media?itemId=${id}`);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: info.outputPath("console-detail.png"),
    fullPage: true,
  });
  await page.goto("/app/search");
  await page.getByRole("searchbox").fill("COPY-ONE");
  await page
    .getByRole("link", {
      name: `View console PlayStation, copy ${id.slice(0, 8)}`,
      exact: true,
    })
    .click();
  await expect(page).toHaveURL(new RegExp(`/app/consoles/${id}$`));
  expect(errors).toEqual([]);
});
test("@critical edits private details and explicitly corrects a model without touching a sibling copy", async ({
  page,
  context,
}) => {
  await signIn(context);
  const { id, siblingId, shelfId } = await seed();
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto(`/app/consoles/${id}`);
  await page.getByRole("button", { name: "Edit console", exact: true }).click();
  expect(
    await page
      .getByRole("dialog")
      .evaluate((node) => node.scrollWidth <= node.clientWidth),
  ).toBe(true);
  await page.getByLabel("Serial number", { exact: true }).fill("CORRECTED");
  await page
    .getByLabel("Private notes", { exact: true })
    .fill("New private note");
  await page.getByLabel("Location", { exact: true }).selectOption(shelfId);
  await page.getByLabel("Has box", { exact: true }).selectOption("no");
  await page
    .getByRole("button", { name: "Correct model identification" })
    .click();
  await page
    .getByRole("option", { name: /^Select PlayStation(?:\s|$)/ })
    .click();
  await page.getByRole("option", { name: /^Select PS one(?:\s|$)/ }).click();
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText("CORRECTED", { exact: true })).toBeVisible();
  await expect(page.getByText("PS one · Copy", { exact: false })).toBeVisible();
  await expect(page.getByText("Home / Shelf", { exact: true })).toBeVisible();
  const copies = await fixture("console-creation-state");
  expect(copies.find((c: { id: string }) => c.id === id)).toMatchObject({
    revision: 2,
    hasBox: false,
    notes: "New private note",
    defects: [{ title: "Yellowing" }],
  });
  expect(copies.find((c: { id: string }) => c.id === siblingId)).toMatchObject({
    revision: 1,
    serialNumber: "COPY-TWO",
  });
});
test("@critical rejects another tab's stale edit, preserves the draft and confirms deletion with cancel focus restoration", async ({
  page,
  context,
}) => {
  await signIn(context);
  const { id, siblingId } = await seed();
  await page.goto(`/app/consoles/${id}`);
  await page.getByRole("button", { name: "Edit console", exact: true }).click();
  await page.getByLabel("Private notes", { exact: true }).fill("Stale draft");
  const other = await context.newPage();
  await other.goto(`/app/consoles/${id}`);
  await other
    .getByRole("button", { name: "Edit console", exact: true })
    .click();
  await other
    .getByLabel("Private notes", { exact: true })
    .fill("Saved in other tab");
  await other
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await expect(other.getByRole("dialog")).toHaveCount(0);
  // Return to the edited tab as a user would before submitting its stale form.
  await page.bringToFront();
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("copy changed");
  await expect(page.getByLabel("Private notes", { exact: true })).toHaveValue(
    "Stale draft",
  );
  await expect(page.getByRole("alert")).toBeFocused();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.reload();
  const trigger = page.getByRole("button", {
    name: "Delete console",
    exact: true,
  });
  await trigger.click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  await expect(trigger).toBeFocused();
  expect(await fixture("console-creation-state")).toHaveLength(2);
  await trigger.click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Delete console", exact: true })
    .click();
  await expect(page).toHaveURL(/\/app\/collection$/);
  const copies = await fixture("console-creation-state");
  expect(copies).toHaveLength(1);
  expect(copies[0].id).toBe(siblingId);
  await page.goto(`/app/consoles/${id}`);
  await expect(
    page.getByRole("heading", { name: "404", exact: true }),
  ).toBeVisible();
  await other.close();
});
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
test("uploads and explicitly selects logo/GLB overrides, clears fallback and removes links while keeping files", async ({
  page,
  context,
}) => {
  await signIn(context);
  const { id } = await seed();
  await page.setViewportSize({ width: 320, height: 720 });
  const logoName = `copy-logo-${"x".repeat(120)}.png`;
  await page.goto(`/app/consoles/${id}`);
  await page.getByLabel("Choose override file", { exact: true }).setInputFiles({
    name: logoName,
    mimeType: "image/png",
    buffer: monochromePng(100, 80),
  });
  await page.getByRole("button", { name: "Upload file", exact: true }).click();
  const logo = page
    .getByRole("list", { name: "Copy overrides" })
    .getByRole("listitem")
    .filter({ hasText: logoName });
  await expect(logo).toBeVisible({ timeout: 20000 });
  await expect(
    page.getByText("No logo available", { exact: true }),
  ).toBeVisible();
  await logo
    .getByRole("button", { name: "Use for this copy", exact: true })
    .click();
  await expect(
    page.getByText("Your copy's custom logo", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Use catalog logo", exact: true })
    .click();
  await expect(
    page.getByText("No logo available", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("File purpose").selectOption("CUSTOM_MODEL");
  await page.getByLabel("Choose override file", { exact: true }).setInputFiles({
    name: "copy-console.glb",
    mimeType: "model/gltf-binary",
    buffer: glb(),
  });
  await page.getByRole("button", { name: "Upload file", exact: true }).click();
  const model = page
    .getByRole("list", { name: "Copy overrides" })
    .getByRole("listitem")
    .filter({ hasText: "copy-console.glb" });
  await expect(model).toBeVisible({ timeout: 20000 });
  await model
    .getByRole("button", { name: "Use for this copy", exact: true })
    .click();
  await expect(
    page.getByText("Your copy's custom 3D file", { exact: true }),
  ).toBeVisible();
  const href = await page
    .getByRole("link", { name: "Download 3D file", exact: true })
    .getAttribute("href");
  const downloaded = await context.request.get(href!);
  expect(downloaded.ok()).toBe(true);
  expect((await downloaded.body()).readUInt32LE(0)).toBe(0x46546c67);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const count = await fixture("asset-count");
  await model
    .getByRole("button", { name: "Remove copy-console.glb", exact: true })
    .click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Remove copy-console.glb", exact: true })
    .click();
  await expect(model).toHaveCount(0);
  await expect(
    page.getByText("No 3D file available", { exact: true }),
  ).toBeVisible();
  expect(await fixture("asset-count")).toBe(count);
});
test("requires private access, gives viewers read-only detail and remains usable at 320px in dark reduced-motion mode", async ({
  page,
  context,
}, info) => {
  const { id } = await seed();
  await page.goto(`/app/consoles/${id}`);
  await expect(page).toHaveURL(/\/login$/);
  await signIn(context, "VIEWER");
  await page.setViewportSize({ width: 320, height: 720 });
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.goto(`/app/consoles/${id}`);
  await expect(page.getByText("COPY-ONE", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Edit console", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Delete console", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByLabel("Choose override file")).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("console-detail-mobile-dark.png"),
    fullPage: true,
  });
  await page.goto("/app/consoles/not-a-uuid");
  await expect(
    page.getByRole("heading", { name: "404", exact: true }),
  ).toBeVisible();
});
test("keeps the copy after an uncertain upload and requires checking saved files before another upload", async ({
  page,
  context,
}) => {
  await signIn(context);
  const { id } = await seed();
  await page.goto(`/app/consoles/${id}`);
  let uploads = 0;
  await page.route("**/api/uploads", async (route) => {
    uploads++;
    await route.abort();
  });
  await page.getByLabel("Choose override file", { exact: true }).setInputFiles({
    name: "logo.png",
    mimeType: "image/png",
    buffer: monochromePng(10, 10),
  });
  await page.getByRole("button", { name: "Upload file", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "couldn't confirm" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Upload file", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Refresh saved files", exact: true })
    .click();
  expect(uploads).toBe(1);
  expect(await fixture("console-creation-state")).toHaveLength(2);
});

test("polishes console identity without blocking anchors, history or live reduced motion", async ({
  page,
  context,
}, info) => {
  await signIn(context, "VIEWER");
  const { id } = await seed();
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto(`/app/consoles/${id}`);
  const nav = page.getByRole("navigation", { name: "Console page sections" });
  const information = nav.getByRole("link", {
    name: "Console Information",
    exact: true,
  });
  await information.focus();
  await information.press("Enter");
  await expect(information).toHaveAttribute("aria-current", "location");
  const gallery = nav.getByRole("link", { name: "Gallery", exact: true });
  await gallery.click();
  await expect(gallery).toHaveAttribute("aria-current", "location");
  await page.goBack();
  await expect(information).toHaveAttribute("aria-current", "location");
  await expect(gallery).not.toHaveAttribute("aria-current", "location");
  await page.reload();
  await expect(information).toHaveAttribute("aria-current", "location");
  await expect(nav).toHaveAttribute("data-section-motion", "enabled");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(nav).toHaveAttribute("data-section-motion", "disabled");
  await expect(
    nav.locator('a[aria-current="location"] > [aria-hidden="true"]'),
  ).toHaveCSS("transform", "none");
  await expect(page.locator("[data-magic-spotlight]")).toHaveCount(0);
  const summary = page.locator("[data-motion-blur]");
  await expect(summary).toHaveCSS("opacity", "1");
  await expect(summary).toHaveCSS("filter", "none");
  await expect(summary).toHaveCSS("transform", "none");
  await expect(page.locator("[data-console-grid]")).toHaveAttribute(
    "aria-hidden",
    "true",
  );
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect(nav).toHaveAttribute("data-section-motion", "enabled");
  await expect(summary).toHaveCSS("transform", "none");
  const fine = await page.evaluate(
    () => matchMedia("(hover: hover) and (pointer: fine)").matches,
  );
  await expect(page.locator("[data-magic-spotlight]")).toHaveCount(
    fine ? 1 : 0,
  );
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: info.outputPath("console-polish.png"),
    fullPage: true,
  });
});

test("keeps console content and section navigation usable without JavaScript", async ({
  browser,
}) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    baseURL: "https://127.0.0.1:3111",
    ignoreHTTPSErrors: true,
    viewport: { width: 320, height: 720 },
  });
  try {
    await signIn(context, "VIEWER");
    const { id } = await seed();
    const page = await context.newPage();
    await page.goto(`/app/consoles/${id}`);
    await expect(page.getByText("COPY-ONE", { exact: true })).toBeVisible();
    await expect(page.locator("[data-motion-blur]")).toHaveCSS("opacity", "1");
    await expect(page.locator("[data-magic-spotlight]")).toHaveCount(0);
    await page
      .getByRole("navigation", { name: "Console page sections" })
      .getByRole("link", { name: "Gallery", exact: true })
      .click();
    await expect(page).toHaveURL(
      new RegExp(`/app/consoles/${id}#console-gallery-title$`),
    );
    await expect(
      page.getByRole("heading", { name: "Gallery", exact: true }),
    ).toBeInViewport();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  } finally {
    await context.close();
  }
});
