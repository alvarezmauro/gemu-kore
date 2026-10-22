import { expect, test, type Page } from "@playwright/test";
import { fixture, signIn } from "../helpers/model-browser";
import { monochromePng } from "../helpers/png-fixtures";

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

// Execute the real server request, then lose only its reply. Assertions remain
// outside the route callback so an interception error cannot masquerade as success.
async function loseReply(page: Page, pattern: string, serverAction = true) {
  const observed = { requests: 0, statuses: [] as number[] };
  let dropped = false;
  await page.route(pattern, async (route) => {
    if (
      route.request().method() !== "POST" ||
      (serverAction && !route.request().headers()["next-action"])
    ) {
      await route.continue();
      return;
    }
    observed.requests++;
    if (dropped) {
      await route.continue();
      return;
    }
    dropped = true;
    const response = await route.fetch();
    observed.statuses.push(response.status());
    await route.abort("failed");
  });
  return observed;
}
const next = (page: Page) =>
  page.getByRole("button", { name: "Continue", exact: true }).click();
const photo = (name: string) => ({
  name,
  mimeType: "image/png",
  buffer: monochromePng(120, 80),
});

async function prepareCopy(page: Page, kind: "console" | "game") {
  await fixture(
    kind === "console" ? "seed-console-creation" : "seed-game-creation",
  );
  await page.goto(`/app/${kind}s/new`);
  if (kind === "console") {
    await page
      .getByRole("option", { name: "Select PlayStation", exact: true })
      .click();
    await next(page);
    await page
      .getByRole("option", { name: "Select SCPH-1000", exact: true })
      .click();
    await next(page);
  } else {
    await page
      .getByRole("option", { name: "Select SNES", exact: true })
      .click();
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
  }
  await page
    .getByLabel("Serial number", { exact: true })
    .fill("00007-RECOVERY");
  await page
    .getByLabel("Private notes", { exact: true })
    .fill("Retain my recovery draft");
  await page.getByRole("button", { name: "Add defect", exact: true }).click();
  await page.getByLabel(/Defect 1 title/).fill("Existing scratch");
  if (kind === "console") await next(page);
  await page
    .getByLabel("Choose photos", { exact: true })
    .setInputFiles(photo("pending.png"));
  await next(page);
  if (kind === "console") await next(page);
  await expect(
    page.getByRole("heading", { name: "Review", exact: true }),
  ).toBeVisible();
}

for (const kind of ["console", "game"] as const) {
  test(`@edge ${kind} lost-save recovery rechecks permission and uploads pending photos only once`, async ({
    page,
    context,
  }) => {
    test.setTimeout(90_000);
    await signIn(context);
    await prepareCopy(page, kind);
    const stateCommand =
      kind === "console" ? "console-creation-state" : "game-creation-state";
    const button = page.getByRole("button", {
      name: `Save ${kind}`,
      exact: true,
    });
    const observed = await loseReply(page, `**/app/${kind}s/new`);
    await button.click();
    await expect(
      page.getByRole("alert").filter({ hasText: "couldn't confirm this save" }),
    ).toBeVisible();
    expect(observed.statuses).toEqual([200]);
    const committed = await fixture(stateCommand);
    expect(committed).toHaveLength(1);
    expect(committed[0]).toMatchObject({
      serialNumber: "00007-RECOVERY",
      notes: "Retain my recovery draft",
      publicationStatus: "PRIVATE",
      defects: [{ title: "Existing scratch" }],
      media: [],
    });
    expect(await fixture("asset-count")).toBe(0);

    await fixture("update", JSON.stringify({ role: "VIEWER" }));
    await button.click();
    await expect(
      page.getByRole("alert").filter({ hasText: "Your account cannot" }),
    ).toBeVisible();
    expect(await fixture(stateCommand)).toEqual(committed);
    expect(await fixture("asset-count")).toBe(0);
    await fixture("update", JSON.stringify({ role: "EDITOR" }));
    await button.click();
    await expect(
      page.getByRole("heading", {
        name: `${kind === "console" ? "Console" : "Game"} saved privately`,
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByText("Saved privately", { exact: true }),
    ).toHaveCount(1);
    const recovered = await fixture(stateCommand);
    expect(recovered).toHaveLength(1);
    expect(recovered[0]).toMatchObject({
      id: committed[0].id,
      serialNumber: committed[0].serialNumber,
      notes: committed[0].notes,
      publicationStatus: "PRIVATE",
      defects: committed[0].defects,
      [kind === "console" ? "ownedConsole" : "ownedGame"]:
        committed[0][kind === "console" ? "ownedConsole" : "ownedGame"],
      media: [{ type: "PHOTO", publicApproved: false }],
    });
    expect(await fixture("asset-count")).toBe(3);
    expect(observed.requests).toBe(3);
    await page.getByRole("link", { name: `View ${kind}`, exact: true }).click();
    await expect(page).toHaveURL(
      new RegExp(`/app/${kind}s/${committed[0].id}$`),
    );
    await expect(
      page.getByText("Retain my recovery draft", { exact: true }),
    ).toBeVisible();
  });
}

test("@edge a committed photo with a lost reply stops its batch and uploads the remaining photo after inspection", async ({
  page,
  context,
}) => {
  test.setTimeout(60_000);
  await signIn(context);
  const { firstId } = await fixture("seed-defect-items");
  await page.goto(`/app/media?itemId=${firstId}`);
  const observed = await loseReply(page, "**/api/uploads", false);
  await page
    .getByLabel("Photo files", { exact: true })
    .setInputFiles([photo("first.png"), photo("second.png")]);
  await expect(
    page.getByText(
      "We couldn't confirm this upload. Refresh the page before uploading this photo again.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Not uploaded. Select this photo again after checking the previous upload.",
      { exact: true },
    ),
  ).toBeVisible();
  const gallery = page.getByRole("list", {
    name: "Photo gallery",
    exact: true,
  });
  await expect(gallery.getByRole("listitem")).toHaveCount(1);
  const first = await fixture("media-records", firstId);
  expect(first).toHaveLength(1);
  expect(first[0]).toMatchObject({ type: "PHOTO", publicApproved: false });
  expect(observed.statuses).toEqual([201]);
  expect(observed.requests).toBe(1);
  expect(await fixture("asset-count")).toBe(3);
  const image = gallery.getByRole("img");
  await expect
    .poll(() => image.evaluate((node: HTMLImageElement) => node.naturalWidth))
    .toBe(120);
  await page.unroute("**/api/uploads");
  await page.reload();
  await expect(gallery.getByRole("listitem")).toHaveCount(1);
  await page
    .getByLabel("Photo files", { exact: true })
    .setInputFiles(photo("second.png"));
  await expect(page.getByText("Saved privately", { exact: true })).toHaveCount(
    1,
  );
  await expect(gallery.getByRole("listitem")).toHaveCount(2);
  const after = await fixture("media-records", firstId);
  expect(after).toHaveLength(2);
  expect(after[0]).toEqual(first[0]);
  expect(new Set(after.map((row: { id: string }) => row.id)).size).toBe(2);
  expect(await fixture("asset-count")).toBe(6);
});

test("@edge lost settings acknowledgement recovers the committed policy without invalidating copies twice", async ({
  page,
  context,
  request,
}) => {
  await fixture("seed-public-home");
  await signIn(context, "ADMIN");
  await page.goto("/app/settings/public");
  const before = await fixture("public-state");
  await page.getByRole("checkbox", { name: /Show collection notes/ }).check();
  await page
    .getByRole("button", { name: "Review settings", exact: true })
    .click();
  await page
    .getByRole("checkbox", { name: /I reviewed these settings/ })
    .check();
  const observed = await loseReply(page, "**/app/settings/public");
  await page
    .getByRole("button", { name: "Save reviewed settings", exact: true })
    .click();
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "couldn't reach publication settings" }),
  ).toBeVisible();
  expect(observed.statuses).toEqual([200]);
  const committed = await fixture("public-state");
  expect(committed).toMatchObject({
    published: 0,
    settings: { showNotes: true, revision: before.settings.revision + 1 },
  });
  await expect(
    page.getByRole("checkbox", { name: /I reviewed these settings/ }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Review settings", exact: true })
    .click();
  await expect(
    page.getByRole("alert").filter({ hasText: "reviewed content changed" }),
  ).toBeVisible();
  expect(await fixture("public-state")).toEqual(committed);
  await page
    .getByRole("link", { name: "Reload settings", exact: true })
    .click();
  await expect(
    page.getByRole("checkbox", { name: /Show collection notes/ }),
  ).toBeChecked();
  await page
    .getByRole("button", { name: "Review settings", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Settings review" }),
  ).toContainText("No copies will lose their individual approval.");
  await page
    .getByRole("checkbox", { name: /I reviewed these settings/ })
    .check();
  await page
    .getByRole("button", { name: "Save reviewed settings", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Settings saved" }),
  ).toBeVisible();
  expect(await fixture("public-state")).toEqual(committed);
  const html = await (await request.get("/collection")).text();
  expect(html).not.toMatch(/PRIVATE-NOTE|PRIVATE-SERIAL/);
});

test("@edge lost copy approval acknowledgement reloads current approval before an explicit withdrawal", async ({
  page,
  context,
  request,
}) => {
  const data = await fixture("seed-public-home");
  await signIn(context, "ADMIN");
  const id = data.privateIds[0];
  const path = `/app/settings/public?item=${id}`;
  const publicPath = `/collection/consoles/${id}`;
  await page.goto(path);
  const copy = page.getByRole("region", { name: "Copy publication" });
  await copy
    .getByRole("button", { name: "Review publication", exact: true })
    .click();
  await copy
    .getByRole("checkbox", { name: /I reviewed this public text/ })
    .check();
  const observed = await loseReply(page, "**/app/settings/public?item=*");
  await copy
    .getByRole("button", { name: "Approve reviewed copy", exact: true })
    .click();
  await expect(copy.getByRole("alert")).toHaveText(
    "We couldn't reach publication controls. Reload and review again.",
  );
  expect(observed.statuses).toEqual([200]);
  expect((await fixture("public-state")).published).toBe(4);
  expect((await request.get(publicPath)).status()).toBe(200);
  await expect(
    copy.getByRole("checkbox", { name: /I reviewed this public text/ }),
  ).toHaveCount(0);
  await copy.getByRole("button", { name: "Reload copy", exact: true }).click();
  await expect(copy).toContainText("Current approval: Published");
  await copy
    .getByRole("button", { name: "Review removal", exact: true })
    .click();
  await copy
    .getByRole("checkbox", { name: /I reviewed this copy and want/ })
    .check();
  await copy
    .getByRole("button", { name: "Make reviewed copy private", exact: true })
    .click();
  await expect(
    copy.getByRole("button", { name: "Review publication", exact: true }),
  ).toBeVisible();
  expect((await fixture("public-state")).published).toBe(3);
  expect((await request.get(publicPath)).status()).toBe(404);
  expect(
    (await request.get(`/collection/consoles/${data.selectedId}`)).status(),
  ).toBe(200);
});

test("@edge a retained public filter form follows narrowed and paused policy on submission", async ({
  page,
  request,
}) => {
  const data = await fixture("seed-public-browse");
  await fixture(
    "public-policy",
    JSON.stringify({ showLocations: true, showDefects: true, showNotes: true }),
  );
  await page.goto("/collection/search?q=SunsetMemo");
  await expect(page.locator("[data-public-copy]")).toHaveCount(1);
  await page.getByText("Filter objects", { exact: true }).click();
  await page
    .getByLabel("Location", { exact: true })
    .selectOption(data.locationId);
  await fixture(
    "public-policy",
    JSON.stringify({
      showLocations: false,
      showDefects: false,
      showNotes: false,
    }),
  );
  await page
    .getByRole("button", { name: "Apply search and filters", exact: true })
    .click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Check your search or filters",
  );
  await expect(page.locator("[data-public-copy]")).toHaveCount(0);
  await expect(page.getByLabel("Location", { exact: true })).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText("PRIVATE-LOCATION");
  expect(
    (
      await request.get(`/api/search/public?location=${data.locationId}`)
    ).status(),
  ).toBe(400);
  expect(
    (await (await request.get("/api/search/public?q=SunsetMemo")).json()).counts
      .total,
  ).toBe(0);
  await page
    .getByRole("link", { name: "Reset search and filters", exact: true })
    .click();
  await expect(page.locator("[data-public-copy]")).toHaveCount(20);
  await page.getByRole("searchbox").fill("Chrono");
  await fixture(
    "public-policy",
    JSON.stringify({ publicCollectionEnabled: false }),
  );
  await page
    .getByRole("button", { name: "Apply search and filters", exact: true })
    .click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "This page is unavailable.",
  );
  await expect(page.locator("[data-public-copy]")).toHaveCount(0);
  const denied = await request.get("/api/search/public?q=Chrono");
  expect(denied.status()).toBe(404);
  expect(denied.headers()["cache-control"]).toContain("no-store");
  expect(await denied.text()).not.toMatch(/Chrono|SunsetMemo|PRIVATE-/);
});
