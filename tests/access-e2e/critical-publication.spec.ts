import { expect, test, type Page } from "@playwright/test";
import { fixture, signIn } from "../helpers/model-browser";

test.beforeEach(async () => {
  await fixture("reset-public");
  await fixture("reset-search");
  await fixture("reset");
});
test.afterAll(async () => {
  await fixture("reset-public");
  await fixture("reset-search");
  await fixture("reset");
});

async function approve(page: Page, id: string) {
  await page.goto(`/app/settings/public?item=${id}`);
  const review = page.getByRole("region", { name: "Copy publication" });
  await review
    .getByRole("button", { name: "Review publication", exact: true })
    .click();
  await expect(
    review.getByRole("button", { name: "Approve reviewed copy" }),
  ).toBeDisabled();
  await review
    .getByRole("checkbox", { name: /I reviewed this public text/ })
    .check();
  await review.getByRole("button", { name: "Approve reviewed copy" }).click();
  await expect(
    review.getByRole("button", { name: "Review removal", exact: true }),
  ).toBeVisible();
}

for (const [index, category, noun, title] of [
  [0, "consoles", "console", "Super Nintendo"],
  [1, "games", "game", "Chrono Trigger"],
  [2, "accessories", "accessory", "Controller"],
] as const) {
  test(`@critical ${noun} copy preserves approval on no-op, loses approval on edit, and disappears after deletion`, async ({
    page,
    context,
    browser,
  }, info) => {
    test.setTimeout(90_000);
    const data = await fixture("seed-public-home");
    const id = data.privateIds[index] as string;
    const publicPath = `/collection/${category}/${id}`;
    const privatePath = `/app/${category}/${id}`;
    const note = `PRIVATE-CRITICAL-${category}-EDIT`;
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await signIn(context, "ADMIN");
    const visitor = await browser.newContext({
      baseURL: "https://127.0.0.1:3111",
      ignoreHTTPSErrors: true,
      viewport: page.viewportSize(),
      isMobile: info.project.use.isMobile,
      hasTouch: info.project.use.hasTouch,
    });
    try {
      expect(await visitor.cookies()).toEqual([]);
      expect((await visitor.request.get(publicPath)).status()).toBe(404);
      await approve(page, id);
      expect((await fixture("public-state")).published).toBe(4);
      const publicPage = await visitor.newPage();
      publicPage.on("pageerror", (error) => errors.push(error.message));
      const response = await publicPage.goto(publicPath);
      expect(response?.status()).toBe(200);
      expect(response?.headers()["cache-control"]).toContain("no-store");
      await expect(publicPage.getByRole("heading", { level: 1 })).toHaveText(
        title,
      );
      const html = await response!.text();
      for (const hidden of [
        "PRIVATE-SERIAL",
        "PRIVATE-NOTE",
        "Private active defect",
        "browser-identity@example.com",
      ])
        expect(html).not.toContain(hidden);

      await page.goto(privatePath);
      await page
        .getByRole("button", { name: `Edit ${noun}`, exact: true })
        .click();
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Save changes", exact: true })
        .click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      expect((await visitor.request.get(publicPath)).status()).toBe(200);
      expect((await fixture("public-state")).published).toBe(4);

      await page
        .getByRole("button", { name: `Edit ${noun}`, exact: true })
        .click();
      const dialog = page.getByRole("dialog");
      await dialog.getByLabel("Private notes", { exact: true }).fill(note);
      await dialog
        .getByRole("button", { name: "Save changes", exact: true })
        .click();
      await expect(dialog).toHaveCount(0);
      await expect(page.getByText(note, { exact: true })).toBeVisible();
      expect((await fixture("public-state")).published).toBe(3);
      expect((await visitor.request.get(publicPath)).status()).toBe(404);
      await publicPage.reload();
      await expect(
        publicPage.getByRole("heading", {
          name: "This page is unavailable.",
        }),
      ).toBeVisible();
      await expect(publicPage.locator("body")).not.toContainText(note);

      await approve(page, id);
      const republished = await visitor.request.get(publicPath);
      expect(republished.status()).toBe(200);
      expect(await republished.text()).not.toContain(note);
      await page.goto(privatePath);
      await page
        .getByRole("button", { name: `Delete ${noun}`, exact: true })
        .click();
      await page
        .getByRole("alertdialog")
        .getByRole("button", { name: `Delete ${noun}`, exact: true })
        .click();
      await expect(page).toHaveURL(/\/app\/collection$/);
      expect((await visitor.request.get(publicPath)).status()).toBe(404);
      expect((await fixture("public-state")).published).toBe(3);
      // An independently published copy remains available after deletion.
      expect(
        (
          await visitor.request.get(`/collection/consoles/${data.selectedId}`)
        ).status(),
      ).toBe(200);
      expect(errors).toEqual([]);
    } finally {
      await visitor.close();
    }
  });
}
