import { expect, test, type Page } from "@playwright/test";
import { fixture, signIn } from "../helpers/model-browser";
import { monochromePng } from "../helpers/png-fixtures";
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
async function choose(page: Page) {
  await page.goto("/app/accessories/new");
  await page
    .getByRole("option", { name: /^Select DualShock 2(?:\s|$)/ })
    .click();
  await next(page);
  await page
    .getByRole("option", { name: /^Select Black \(black\)(?:\s|$)/ })
    .click();
  await next(page);
}
test("editor prepares accessory evidence, admin accepts typed fields, and the copy draft refreshes without losing personal files", async ({
  page,
  context,
  browser,
}, info) => {
  test.setTimeout(90000);
  const catalog = await fixture(
      "seed-accessory-copies",
      JSON.stringify({ unassignedProducer: true }),
    ),
    editor = await signIn(context);
  await choose(page);
  await page
    .getByLabel("Private notes", { exact: true })
    .fill("Retain my controller notes");
  await page.getByLabel("Choose photos", { exact: true }).setInputFiles({
    name: "controller.png",
    mimeType: "image/png",
    buffer: monochromePng(120, 80),
  });
  const [review] = await Promise.all([
    context.waitForEvent("page"),
    page
      .getByRole("link", {
        name: "Review accessory metadata (opens a new tab)",
        exact: true,
      })
      .click(),
  ]);
  await expect(
    review.getByRole("heading", { name: "Review metadata", level: 1 }),
  ).toBeVisible();
  await review
    .getByRole("button", { name: "Find metadata", exact: true })
    .click();
  await expect(
    review.getByText(/Metadata lookup is not configured/),
  ).toBeVisible();
  const fetched = await fixture(
    "seed-accessory-enrichment",
    JSON.stringify({ token: editor.token, id: catalog.accessoryId }),
  );
  await review.goto(`/app/enrichment?runId=${fetched.id}`);
  await expect(
    review.getByRole("heading", { name: "Source observations", exact: true }),
  ).toBeVisible();
  await expect(review.getByRole("img")).toHaveCount(0);
  await expect(
    review.getByRole("region", { name: "Evidence limitations", exact: true }),
  ).toContainText("specific variant");
  await review.getByLabel("Description", { exact: true }).check();
  await review.getByLabel("Release year", { exact: true }).check();
  await review.getByLabel("Producer", { exact: true }).check();
  await review.getByLabel("Product video", { exact: true }).check();
  await review.getByLabel("External references", { exact: true }).check();
  await review
    .getByLabel("Find a company for Sony", { exact: true })
    .fill("Sony");
  await review
    .getByRole("button", { name: "Find company for Sony", exact: true })
    .click();
  await review
    .getByRole("button", { name: "Choose Sony", exact: true })
    .click();
  await review
    .getByLabel("Video to review", { exact: true })
    .selectOption("dQw4w9WgXcQ");
  await review
    .getByRole("button", { name: "Prepare preview", exact: true })
    .click();
  await expect(
    review.getByRole("article", { name: "Producer suggestion", exact: true }),
  ).toContainText("Sony");
  await expect(review.getByRole("button", { name: /^Apply/ })).toHaveCount(0);
  const adminContext = await browser.newContext({
    baseURL: "https://127.0.0.1:3111",
    ignoreHTTPSErrors: true,
    viewport:
      info.project.name === "mobile-chromium"
        ? { width: 320, height: 740 }
        : { width: 1280, height: 900 },
    colorScheme: "dark",
    reducedMotion: "reduce",
  });
  try {
    await signIn(
      adminContext,
      "ADMIN",
      "accessory-enrichment-admin@example.com",
    );
    const admin = await adminContext.newPage();
    await admin.goto(`/app/enrichment?runId=${fetched.id}`);
    await expect(
      admin.getByRole("button", { name: "Apply all", exact: true }),
    ).toBeDisabled();
    await admin
      .getByLabel(
        "I reviewed replacing the current release year, including any manually entered information.",
        { exact: true },
      )
      .check();
    await expect(
      admin.getByRole("button", { name: "Apply all", exact: true }),
    ).toBeEnabled();
    await admin.screenshot({
      path: info.outputPath("accessory-enrichment-review.png"),
      fullPage: true,
    });
    await admin.getByRole("button", { name: "Apply all", exact: true }).click();
    await expect(
      admin.getByRole("heading", { name: "Changes applied", exact: true }),
    ).toBeVisible();
    expect(
      await admin.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const state = await fixture("accessory-enrichment-state");
    expect(state.families).toMatchObject([
      {
        id: catalog.accessoryId,
        releaseYear: 2001,
        description: "Synthetic sourced controller description",
        trailerProvider: "YOUTUBE",
        trailerPublicApproved: false,
      },
    ]);
    expect(state.changes).toHaveLength(5);
    expect(
      state.variants.find((v: { id: string }) => v.id === catalog.variantId),
    ).toMatchObject({
      revision: 1,
      regions: [{ regionId: expect.any(String) }],
      platforms: [{ platformId: expect.any(String) }],
    });
  } finally {
    await adminContext.close();
  }
  await page.bringToFront();
  await next(page);
  await page
    .getByRole("button", { name: "Save accessory", exact: true })
    .click();
  await expect(
    page
      .getByRole("region", { name: "Add accessory", exact: true })
      .getByRole("alert"),
  ).toContainText("changed");
  await page
    .getByRole("button", { name: "Refresh catalog choices", exact: true })
    .click();
  await expect(page.getByLabel("Private notes", { exact: true })).toHaveValue(
    "Retain my controller notes",
  );
  await expect(
    page.getByRole("list", { name: "Selected files", exact: true }),
  ).toContainText("controller.png");
  await next(page);
  await page
    .getByRole("button", { name: "Save accessory", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Accessory saved", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Saved privately", { exact: true })).toHaveCount(
    1,
    { timeout: 20000 },
  );
});
test("variant review applies only a reference and requires acknowledgement to replace a manual family value", async ({
  page,
  context,
}) => {
  test.setTimeout(60000);
  const data = await fixture("seed-accessory-copies"),
    admin = await signIn(context, "ADMIN");
  let run = await fixture(
    "seed-accessory-enrichment",
    JSON.stringify({ token: admin.token, id: data.variantId, kind: "variant" }),
  );
  await page.goto(`/app/enrichment?runId=${run.id}`);
  await expect(
    page.getByLabel("External references", { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Release year", { exact: true })).toHaveCount(0);
  await page.getByLabel("External references", { exact: true }).check();
  await page
    .getByRole("button", { name: "Prepare preview", exact: true })
    .click();
  await page.getByRole("button", { name: "Apply all", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Changes applied", exact: true }),
  ).toBeVisible();
  run = await fixture(
    "seed-accessory-enrichment",
    JSON.stringify({ token: admin.token, id: data.accessoryId }),
  );
  await page.goto(`/app/enrichment?runId=${run.id}`);
  await page.getByLabel("Title", { exact: true }).check();
  await page
    .getByRole("button", { name: "Prepare preview", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Apply all", exact: true }),
  ).toBeDisabled();
  const card = page.getByRole("article", {
    name: "Title suggestion",
    exact: true,
  });
  await card
    .getByLabel(
      "I reviewed replacing the current title, including any manually entered information.",
      { exact: true },
    )
    .check();
  await page.getByRole("button", { name: "Apply all", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Changes applied", exact: true }),
  ).toBeVisible();
  expect((await fixture("accessory-enrichment-state")).families[0].name).toBe(
    "Synthetic controller",
  );
});
test("viewers have no enrichment entry or run access, and revoked editor permission is enforced", async ({
  page,
  context,
}) => {
  const data = await fixture("seed-accessory-copies");
  await signIn(context, "VIEWER");
  await page.goto(`/app/enrichment?kind=accessory&id=${data.accessoryId}`);
  await expect(page).toHaveURL(/access-denied/);
  await page.goto("/app/accessories/new");
  await expect(page).toHaveURL(/access-denied/);
  await fixture("update", JSON.stringify({ role: "EDITOR" }));
  await page.goto(`/app/enrichment?kind=accessory&id=${data.accessoryId}`);
  await page
    .getByRole("button", { name: "Find metadata", exact: true })
    .click();
  await expect(
    page.getByText(/Metadata lookup is not configured/),
  ).toBeVisible();
  await fixture("update", JSON.stringify({ enabled: false }));
  await page.getByRole("button", { name: "Retry lookup", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Your access changed" }),
  ).toBeVisible();
});
