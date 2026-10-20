import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { expect, test, type BrowserContext } from "@playwright/test";
import { signedSessionCookie } from "../helpers/access-session";
const exec = promisify(execFile);
async function fixture(command: string, input?: unknown) {
  const { stdout } = await exec(
    process.execPath,
    [
      "--conditions=react-server",
      "--import",
      "tsx",
      "tests/helpers/access-browser-fixture.ts",
      command,
      ...(input === undefined
        ? []
        : [typeof input === "string" ? input : JSON.stringify(input)]),
    ],
    { env: { ...process.env, NODE_ENV: "production" }, timeout: 15000 },
  );
  return JSON.parse(stdout.trim());
}
async function signIn(
  context: BrowserContext,
  role: "EDITOR" | "ADMIN" | "VIEWER",
) {
  const session = await fixture("sign-in", {
    role,
    email: `${randomUUID()}@example.com`,
  });
  await context.addCookies([
    {
      name: "__Secure-gemukore.session_token",
      value: signedSessionCookie(
        session.token,
        process.env.BETTER_AUTH_SECRET!,
      ),
      url: "https://127.0.0.1:3111",
      secure: true,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  return session;
}
test.beforeEach(async () => {
  await fixture("reset-game-creation");
  await fixture("reset");
});
test.afterAll(async () => {
  await fixture("reset-game-creation");
  await fixture("reset");
});
test("viewers can read current metadata sources without access to enrichment reviews", async ({
  page,
  context,
}, info) => {
  const catalog = await fixture("seed-game-creation");
  const admin = await signIn(context, "ADMIN");
  const review = await fixture("seed-enrichment", {
    token: admin.token,
    gameId: catalog.gameId,
    apply: true,
  });
  const copy = await fixture("seed-provenance-copy", {
    token: admin.token,
    releaseId: catalog.releaseId,
  });
  await signIn(context, "VIEWER");
  await page.setViewportSize({ width: 320, height: 740 });
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.goto(`/app/games/${copy.id}`);
  const sources = page.getByRole("region", {
    name: "Metadata sources",
    exact: true,
  });
  await sources.getByText("Game sources", { exact: true }).click();
  const gameSources = sources
    .locator("details")
    .filter({ has: page.getByText("Game sources", { exact: true }) });
  await expect(
    sources.getByText("Imported metadata", { exact: true }),
  ).toHaveCount(3);
  await expect(
    gameSources.getByText("Source unknown", { exact: true }),
  ).toHaveCount(4);
  await expect(
    sources.getByText("Confidence: Not provided", { exact: true }),
  ).toHaveCount(3);
  await sources.getByText("Release sources", { exact: true }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(await sources.innerHTML()).not.toMatch(
    /reviewToken|sourceSnapshot|actorId|requestedById/,
  );
  await page.screenshot({
    path: info.outputPath("provenance-viewer-mobile-dark.png"),
    fullPage: true,
  });
  await page.goto(`/app/enrichment?runId=${review.id}`);
  await expect(page).toHaveURL(/\/access-denied$/);
  await context.clearCookies();
  await page.goto(`/app/games/${copy.id}`);
  await expect(page).toHaveURL(/\/login$/);
});
test("administrator history keeps an imported source after a later manual correction", async ({
  page,
  context,
}, info) => {
  const catalog = await fixture("seed-game-creation");
  const admin = await signIn(context, "ADMIN");
  await fixture("seed-enrichment", {
    token: admin.token,
    gameId: catalog.gameId,
    apply: true,
  });
  const copy = await fixture("seed-provenance-copy", {
    token: admin.token,
    releaseId: catalog.releaseId,
  });
  await page.goto(`/app/catalog/games?kind=game&id=${catalog.gameId}`);
  await page
    .getByLabel("Description", { exact: true })
    .fill("Manually corrected description");
  await page
    .getByRole("button", { name: "Save catalog record", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Catalog record saved." }),
  ).toBeVisible();
  await expect(
    page.getByText("Imported metadata", { exact: true }),
  ).toHaveCount(3);
  await expect(page.getByText("Manually entered", { exact: true })).toHaveCount(
    1,
  );
  await expect(
    page.getByRole("link", { name: /Source page/ }).first(),
  ).toHaveAttribute("rel", "noopener noreferrer");
  await page.goto(`/app/games/${copy.id}`);
  const sources = page.getByRole("region", {
    name: "Metadata sources",
    exact: true,
  });
  await sources.getByText("Game sources", { exact: true }).click();
  const description = sources.getByRole("listitem").filter({
    has: page.getByRole("heading", { name: "Description", exact: true }),
  });
  await expect(
    description.getByText("Manually entered", { exact: true }),
  ).toBeVisible();
  await expect(
    description.getByRole("link", { name: /Source page/ }),
  ).toHaveCount(0);
  await page.screenshot({
    path: info.outputPath("provenance-current-manual.png"),
    fullPage: true,
  });
});
