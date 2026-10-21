import { expect, test } from "@playwright/test";
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

test("home and category links browse published copies with the same safe HTML, Flight and JSON for every role", async ({
  page,
  context,
  request,
}, info) => {
  const data = await fixture("seed-public-browse");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/collection");
  await page.getByRole("link", { name: "Browse games", exact: true }).click();
  await expect(page).toHaveURL(/\/collection\/games$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Games");
  await expect(page.getByRole("status")).toHaveText(
    "Showing 1–20 of 45 objects",
  );
  const objects = page.getByRole("list", { name: "Collection objects" });
  await expect(objects.getByRole("listitem")).toHaveCount(20);
  await expect(objects.getByRole("link")).toHaveCount(0);
  await page.screenshot({
    path: info.outputPath("public-browse-light.png"),
    fullPage: true,
  });
  const nav = page.getByRole("navigation", { name: "Browse collection" });
  for (const [label, count] of [
    ["Consoles", 1],
    ["Accessories", 1],
    ["All objects", 20],
  ] as const) {
    await nav.getByRole("link", { name: label, exact: true }).click();
    await expect(objects.getByRole("listitem")).toHaveCount(count);
  }
  const forbidden = [
    "PRIVATE-",
    "NeverRevealSerial",
    "NeverRevealRepair",
    "SunsetMemo",
    "HiddenMemo",
    ...data.privateIds,
    "/api/media/private",
    "@example.com",
  ];
  for (const role of [undefined, "ADMIN", "EDITOR", "VIEWER"] as const) {
    if (role)
      await signIn(context, role, `browse-${role.toLowerCase()}@example.com`);
    const html = await (await context.request.get("/collection/games")).text();
    const flight = await context.request.get("/collection/games?_rsc=browse", {
      headers: { RSC: "1" },
    });
    expect(flight.headers()["cache-control"]).toContain("no-store");
    const flightBody = await flight.text();
    const response = await context.request.get("/api/search/public?type=game");
    expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toBe("no-store");
    const result = await response.json();
    expect(result.counts.total).toBe(45);
    expect(result.items).toHaveLength(20);
    expect(result.filters).toEqual({});
    for (const value of forbidden) {
      expect(html).not.toContain(value);
      expect(flightBody).not.toContain(value);
      expect(JSON.stringify(result)).not.toContain(value);
    }
  }
  for (const query of [
    "HiddenMemo",
    "SunsetMemo",
    "NeverRevealSerial",
    "NeverRevealRepair",
    "PRIVATE-PLATFORM",
  ]) {
    const response = await request.get(`/api/search/public?q=${query}`);
    expect((await response.json()).counts.total).toBe(0);
  }
  await expect(page.locator("canvas,iframe,video,img")).toHaveCount(0);
});

test("stable paging covers every duplicate physical game, survives navigation and handles deleted last pages", async ({
  page,
  request,
}) => {
  await fixture("seed-public-browse");
  await page.goto("/collection/games?q=Chrono&sort=name-asc");
  const ids: string[] = [];
  for (const [index, size] of [20, 20, 5].entries()) {
    await expect(page.getByRole("status")).toHaveText(
      `Showing ${index * 20 + 1}–${index * 20 + size} of 45 objects`,
    );
    const items = page.locator("[data-public-copy]");
    await expect(items).toHaveCount(size);
    ids.push(
      ...(await items.evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute("data-public-copy")!),
      )),
    );
    if (index < 2)
      await page.getByRole("link", { name: "Next page", exact: true }).click();
  }
  expect(new Set(ids).size).toBe(45);
  await expect(
    page.getByRole("link", { name: "Next page", exact: true }),
  ).toHaveCount(0);
  await page.reload();
  await expect(page.locator("[data-public-copy]")).toHaveCount(5);
  await page.getByRole("link", { name: "Previous page", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText(
    "Showing 21–40 of 45 objects",
  );
  await page.goBack();
  await expect(page.locator("[data-public-copy]")).toHaveCount(5);
  await fixture("public-delete-items", JSON.stringify(ids.slice(40)));
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "There are no objects on this page" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "First page", exact: true }).click();
  await expect(page).toHaveURL(/\/collection\/games\?q=Chrono$/);
  await expect(page.getByRole("status")).toHaveText(
    "Showing 1–20 of 40 objects",
  );
  const final = await request.get(
    "/api/search/public?type=game&q=Chrono&page=2",
  );
  expect(await final.json()).toMatchObject({
    counts: { total: 40 },
    offset: 20,
    hasMore: false,
  });
});

test("native filters combine with search, reset pagination, preserve active choices and clear individually", async ({
  page,
  request,
}) => {
  const data = await fixture("seed-public-browse");
  await page.goto("/collection/games?page=2");
  await page.getByText("Filter objects", { exact: true }).click();
  await page
    .getByRole("searchbox", { name: "Search the collection" })
    .fill("Chrono");
  await page
    .getByLabel("Platform", { exact: true })
    .selectOption(data.platformId);
  await page.getByLabel("Region", { exact: true }).selectOption(data.regionId);
  await page
    .getByLabel("Company", { exact: true })
    .selectOption(data.companyId);
  await page.getByLabel("Release year", { exact: true }).selectOption("1995");
  await page.getByLabel("Box", { exact: true }).selectOption("unknown");
  await page.getByLabel("Sort by", { exact: true }).selectOption("newest");
  await page.getByRole("button", { name: "Apply search and filters" }).click();
  expect(new URL(page.url()).searchParams.has("page")).toBe(false);
  await expect(page.getByRole("status")).toHaveText(
    "Showing 1–15 of 15 objects",
  );
  await expect(page.getByLabel("Platform", { exact: true })).toHaveValue(
    data.platformId,
  );
  await page
    .getByRole("link", { name: "Remove Box unknown", exact: true })
    .click();
  await expect(page.getByRole("status")).toHaveText(
    "Showing 1–20 of 45 objects",
  );
  await expect(page.getByLabel("Box", { exact: true })).toHaveValue("");
  expect(new URL(page.url()).searchParams.get("year")).toBe("1995");
  await page
    .getByRole("link", { name: "Clear all filters", exact: true })
    .click();
  await expect(page).toHaveURL(/\/collection\/games$/);
  await expect(page.getByRole("searchbox")).toHaveValue("");
  await expect(page.getByLabel("Sort by", { exact: true })).toHaveValue(
    "name-asc",
  );
  for (const name of ["Platform", "Region", "Company", "Release year"])
    await expect(page.getByLabel(name, { exact: true })).toHaveValue("");
  const fuzzy = await request.get(
    "/api/search/public?type=game&q=Chrono%20Triger&sort=relevance",
  );
  expect((await fuzzy.json()).counts.total).toBe(45);
  await page.getByRole("searchbox").fill("NoSuchPublishedObject");
  await page.getByRole("button", { name: "Apply search and filters" }).click();
  await expect(
    page.getByRole("heading", { name: "No objects match these filters" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Next page", exact: true }),
  ).toHaveCount(0);
});

test("personal-field controls and matching follow current policy without revealing hidden location options or repair text", async ({
  page,
  request,
}) => {
  const data = await fixture("seed-public-browse");
  await page.goto("/collection/search");
  await expect(page.getByLabel("Location", { exact: true })).toHaveCount(0);
  await expect(
    page.getByLabel("Unresolved defects", { exact: true }),
  ).toHaveCount(0);
  for (const filter of [`location=${data.locationId}`, "hasDefects=false"])
    expect((await request.get(`/api/search/public?${filter}`)).status()).toBe(
      400,
    );
  await fixture(
    "public-policy",
    JSON.stringify({
      showLocations: true,
      showDefects: true,
      showNotes: true,
      showSerialNumbers: true,
    }),
  );
  await page.reload();
  await page.getByText("Filter objects", { exact: true }).click();
  await expect(page.getByLabel("Location", { exact: true })).toContainText(
    "Display shelf (2)",
  );
  await expect(page.getByLabel("Location", { exact: true })).not.toContainText(
    "PRIVATE-LOCATION",
  );
  await page
    .getByLabel("Location", { exact: true })
    .selectOption(data.locationId);
  await page
    .getByLabel("Unresolved defects", { exact: true })
    .selectOption("true");
  await page.getByRole("searchbox").fill("Chrono");
  await page.getByRole("button", { name: "Apply search and filters" }).click();
  await expect(page.locator("[data-public-copy]")).toHaveCount(1);
  const note = await request.get("/api/search/public?q=SunsetMemo");
  expect(
    (await note.json()).items.map((item: { id: string }) => item.id),
  ).toEqual([data.noteId]);
  for (const query of ["NeverRevealSerial", "NeverRevealRepair", "HiddenMemo"])
    expect(
      (await (await request.get(`/api/search/public?q=${query}`)).json()).counts
        .total,
    ).toBe(0);
  await fixture(
    "public-policy",
    JSON.stringify({
      showLocations: false,
      showDefects: false,
      showNotes: false,
    }),
  );
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Check your search or filters",
  );
  await page
    .getByRole("link", { name: "Reset search and filters", exact: true })
    .click();
  await expect(page.getByLabel("Location", { exact: true })).toHaveCount(0);
  expect(
    (await (await request.get("/api/search/public?q=SunsetMemo")).json()).counts
      .total,
  ).toBe(0);
});

test("invalid input, HEAD, conditional requests and revoked public access fail without leaking data", async ({
  page,
  context,
  request,
}) => {
  await fixture("seed-public-browse");
  await signIn(context, "ADMIN");
  for (const query of [
    "role=ADMIN",
    "audience=private",
    "q=first&q=second",
    "page=252",
    "hasBox=yes",
    "limit=5000",
  ]) {
    const response = await request.get(`/api/search/public?${query}`);
    expect(response.status()).toBe(400);
    expect(response.headers()["cache-control"]).toBe("no-store");
  }
  await page.goto("/collection/consoles?type=game");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Check your search or filters",
  );
  const head = await request.head("/api/search/public?type=game");
  expect(head.status()).toBe(200);
  expect(head.headers()["cache-control"]).toBe("no-store");
  expect(await head.text()).toBe("");
  const method = await request.post("/api/search/public", {
    data: { role: "ADMIN" },
  });
  expect(method.status()).toBe(405);
  expect(method.headers()["cache-control"]).toContain("no-store");
  await fixture(
    "public-policy",
    JSON.stringify({ publicCollectionEnabled: false }),
  );
  for (const path of [
    "/collection/consoles",
    "/collection/games",
    "/collection/accessories",
    "/collection/search",
    "/collection/games?role=ADMIN",
    "/api/search/public",
    "/api/search/public?role=ADMIN",
  ]) {
    const response = await context.request.get(path, {
      headers: { "if-none-match": '"old-public"' },
    });
    expect(response.status()).toBe(404);
    expect(response.headers()["cache-control"]).toContain("no-store");
    expect(await response.text()).not.toMatch(
      /PRIVATE-|Chrono|SunsetMemo|Showing 1/,
    );
  }
  expect((await request.head("/api/search/public")).status()).toBe(404);
  await page.goto("/collection/games");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "This page is unavailable.",
  );
});

test("browse forms and paging work without JavaScript, and narrow dark layouts wrap long titles at enlarged text sizes", async ({
  browser,
  page,
  context,
}, info) => {
  await fixture("seed-public-browse", JSON.stringify({ longTitle: true }));
  const noJs = await browser.newContext({
    baseURL: "https://127.0.0.1:3111",
    ignoreHTTPSErrors: true,
    javaScriptEnabled: false,
    viewport: { width: 320, height: 740 },
  });
  try {
    const read = await noJs.newPage();
    await read.goto("/collection/games");
    await expect(read.locator("[data-public-copy]")).toHaveCount(20);
    await read.getByRole("link", { name: "Next page", exact: true }).click();
    await expect(read.getByRole("status")).toHaveText(
      "Showing 21–40 of 45 objects",
    );
    await read.getByRole("searchbox").fill("NoSuchPublishedObject");
    await read
      .getByRole("button", { name: "Apply search and filters" })
      .click();
    await expect(
      read.getByRole("heading", { name: "No objects match these filters" }),
    ).toBeVisible();
    await read
      .getByRole("link", { name: "Reset search and filters", exact: true })
      .click();
    await expect(read.locator("[data-public-copy]")).toHaveCount(20);
  } finally {
    await noJs.close();
  }
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await context.addInitScript(() =>
    localStorage.setItem("gemukore-theme", "dark"),
  );
  await page.setViewportSize({ width: 320, height: 740 });
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.goto("/collection/games");
  await page.getByText("Filter objects", { exact: true }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("public-browse-narrow-dark-filters.png"),
  });
  await page.locator("[data-public-copy]").first().scrollIntoViewIfNeeded();
  await page.screenshot({
    path: info.outputPath("public-browse-narrow-dark-object.png"),
  });
  await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    "noindex, nofollow",
  );
  await expect(page.locator("canvas,iframe,video,img")).toHaveCount(0);
  expect(errors).toEqual([]);
});
