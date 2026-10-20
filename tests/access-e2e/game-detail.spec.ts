import { expect, test } from "@playwright/test";
import { fixture, signIn } from "../helpers/model-browser";
test.beforeEach(async () => {
  await fixture("reset-game-creation");
  await fixture("reset");
});
test.afterAll(async () => {
  await fixture("reset-game-creation");
  await fixture("reset");
});
const sections = [
  "My copy",
  "About",
  "Screenshots",
  "Physical edition",
  "Edition contents",
  "Trailer",
];
async function seed(context: Parameters<typeof signIn>[0], longTitle = false) {
  const identity = await signIn(context, "ADMIN"),
    catalog = await fixture("seed-game-creation");
  const copy = await fixture(
    "seed-provenance-copy",
    JSON.stringify({ token: identity.token, releaseId: catalog.releaseId }),
  );
  const art = await fixture(
    "seed-game-detail",
    JSON.stringify({ id: copy.id, releaseId: catalog.releaseId, longTitle }),
  );
  return { ...catalog, ...copy, ...art };
}
test("game detail presents the selected release, copy context and six working sections without activating media", async ({
  page,
  context,
}, info) => {
  test.setTimeout(90_000);
  const data = await seed(context),
    errors: string[] = [],
    external: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (!request.url().startsWith("https://127.0.0.1:3111"))
      external.push(request.url());
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`/app/games/${data.id}`);
  const hero = page.getByRole("region", { name: "Game identity", exact: true });
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect(hero.getByRole("heading", { level: 1 })).toHaveText(data.title);
  const cover = hero.getByRole("img", {
    name: "Synthetic release cover",
    exact: true,
  });
  await expect
    .poll(() => cover.evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBe(300);
  await expect(cover).toHaveAttribute(
    "src",
    new RegExp(`/api/media/private/${data.releaseCoverId}$`),
  );
  await expect(hero).toContainText("1995");
  await expect(hero).not.toContainText("1994");
  await expect(hero).toContainText("Synthetic studio");
  await expect(hero).toContainText("North America");
  await expect(hero).toContainText("Standard Edition");
  await expect(hero.locator("dl")).toContainText("RatingNot recorded");
  await hero.getByText("Cover source details", { exact: true }).click();
  await expect(hero).toContainText("Original synthetic test artwork");
  await expect(
    page.locator(
      "#my-copy > h2, #about-game > h2, #screenshots > h2, #game-packaging > h2, #game-release > h2, #game-trailer > h2",
    ),
  ).toHaveText(sections);
  const copy = page.getByRole("region", { name: "My copy", exact: true });
  await expect(copy).toContainText("COPY-0001");
  await expect(copy).toContainText("Private copy notes.");
  await expect(
    copy.getByRole("region", { name: "Personal photos", exact: true }),
  ).toContainText("A personal copy photo");
  const about = page.getByRole("region", { name: "About", exact: true });
  await expect(about).toContainText("1995-08");
  await expect(about).not.toContainText("1995-08-01");
  await expect(about).toContainText("A release-specific description.");
  await expect(about).toContainText("SYNTH-001");
  await expect(about).not.toContainText("COPY-0001");
  for (const label of [
    ...sections,
    "Playtime",
    "Personal photos",
    "Metadata sources",
  ]) {
    await page
      .getByRole("navigation", { name: "Game sections" })
      .getByRole("link", { name: label, exact: true })
      .click();
    const id = new URL(page.url()).hash.slice(1);
    await expect(page.locator(`#${id}`)).toBeInViewport();
  }
  await expect(page.locator("canvas, iframe, video")).toHaveCount(0);
  expect(external).toEqual([]);
  await page.goto(`/app/games/${data.id}`);
  await page.screenshot({
    path: info.outputPath("game-detail-light.png"),
    fullPage: true,
  });
  await context.addInitScript(() =>
    localStorage.setItem("gemukore-theme", "dark"),
  );
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.screenshot({
    path: info.outputPath("game-detail-dark.png"),
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
test("game detail keeps long titles and truthful cover fallbacks usable on narrow read-only pages", async ({
  page,
  context,
}, info) => {
  test.setTimeout(90_000);
  const data = await seed(context, true);
  await fixture("update", JSON.stringify({ role: "VIEWER" }));
  await page.setViewportSize({ width: 320, height: 720 });
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark" });
  await context.addInitScript(() =>
    localStorage.setItem("gemukore-theme", "dark"),
  );
  const url = `/app/games/${data.id}`,
    hero = page.getByRole("region", { name: "Game identity", exact: true });
  await page.goto(url);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(data.title);
  await expect(
    page.getByRole("button", { name: "Edit game", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole("link", { name: /^Manage release/ })).toHaveCount(
    0,
  );
  await expect(page.locator("[data-magic-spotlight]")).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("game-detail-mobile-dark.png"),
    fullPage: true,
  });
  await page.route(`**/api/media/private/${data.releaseCoverId}`, (route) =>
    route.fulfill({ status: 404, body: "Unavailable" }),
  );
  await page.reload();
  await expect(
    hero.getByText("Cover image unavailable", { exact: true }),
  ).toBeVisible();
  await page.unroute(`**/api/media/private/${data.releaseCoverId}`);
  await fixture(
    "remove-detail-covers",
    JSON.stringify({ releaseId: data.releaseId }),
  );
  await page.reload();
  await expect(hero.getByRole("img")).toHaveAttribute(
    "src",
    new RegExp(`/api/media/private/${data.gameCoverId}$`),
  );
  await expect(hero).toContainText("Game default; no release cover recorded");
  await fixture(
    "remove-detail-covers",
    JSON.stringify({
      gameId: data.gameId,
      releaseId: data.releaseId,
      scope: "all",
    }),
  );
  await page.reload();
  await expect(
    hero.getByText("No catalog cover available", { exact: true }),
  ).toBeVisible();
  await expect(hero.getByRole("img")).toHaveCount(0);
  await expect(
    page
      .getByRole("region", { name: "Personal photos", exact: true })
      .getByRole("img"),
  ).toBeVisible();
  // Check desktop 200% zoom independently from the 320px mobile reflow case.
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.locator("body").evaluate((node) => {
    node.style.zoom = "2";
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await expect(page.locator("canvas, iframe, video")).toHaveCount(0);
  await fixture("update", JSON.stringify({ enabled: false }));
  expect(
    (
      await context.request.get(`/api/media/private/${data.gameCoverId}`)
    ).status(),
  ).toBe(403);
  await page.goto(url);
  await expect(page).toHaveURL(/access-denied/);
  await context.clearCookies();
  await page.goto(url);
  await expect(page).toHaveURL(/login/);
});
