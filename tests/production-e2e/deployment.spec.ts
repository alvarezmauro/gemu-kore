import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { signedSessionCookie } from "../helpers/access-session";
import { monochromePng } from "../helpers/png-fixtures";
import { modelFixture } from "../helpers/model-fixture";

const exec = promisify(execFile);
async function fixture(command: string, argument?: string) {
  const { stdout } = await exec(
    "docker",
    [
      "compose",
      "--project-name",
      process.env.PRODUCTION_TEST_PROJECT!,
      "--env-file",
      process.env.PRODUCTION_TEST_ENV!,
      "-f",
      "docker-compose.production.yml",
      "-f",
      process.env.PRODUCTION_TEST_OVERRIDE!,
      "run",
      "--rm",
      "--no-deps",
      "--entrypoint",
      "node",
      "operations",
      "--conditions=react-server",
      "--import",
      "tsx",
      "tests/helpers/access-browser-fixture.ts",
      command,
      ...(argument ? [argument] : []),
    ],
    { timeout: 30000, maxBuffer: 1024 * 1024 },
  );
  return JSON.parse(stdout.trim());
}

test.beforeEach(async () => {
  await fixture("reset-search");
});

test("production HTTPS serves private uploads, 3D ranges and revocable public media", async ({
  page,
  context,
  request,
}) => {
  const health = await request.get("/api/health");
  expect(health.status()).toBe(200);
  expect(health.headers()["cache-control"]).toContain("no-store");
  await page.goto("/app");
  await expect(page).toHaveURL(/\/login/);
  const email = `${randomUUID()}@example.com`;
  const identity = await fixture(
    "sign-in",
    JSON.stringify({ role: "EDITOR", email }),
  );
  await context.addCookies([
    {
      name: "__Secure-gemukore.session_token",
      value: signedSessionCookie(
        identity.token,
        process.env.BETTER_AUTH_SECRET!,
      ),
      url: "https://127.0.0.1:3111",
      secure: true,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  const { firstId } = await fixture("seed-defect-items");
  await page.goto(`/app/media?itemId=${firstId}`);
  await expect(page).toHaveURL(new RegExp(`/app/media\\?itemId=${firstId}`));
  await page.getByLabel("Photo files", { exact: true }).setInputFiles({
    name: "production.png",
    mimeType: "image/png",
    buffer: monochromePng(120, 80),
  });
  await expect(page.getByText("Saved privately", { exact: true })).toBeVisible({
    timeout: 30000,
  });
  const photo = page
    .getByRole("list", { name: "Photo gallery", exact: true })
    .getByRole("img");
  await expect(photo).toBeVisible();
  const privateUrl = (await photo.getAttribute("src"))!;
  const derivative = await page.request.get(privateUrl);
  expect(derivative.status()).toBe(200);
  expect(derivative.headers()["content-type"]).toBe("image/webp");
  expect(derivative.headers()["cache-control"]).toContain("no-store");
  expect(
    await photo.evaluate((image) => (image as HTMLImageElement).naturalWidth),
  ).toBeGreaterThan(0);
  expect((await request.get(privateUrl)).status()).toBe(401);

  const { modelId } = await fixture("seed-console-creation");
  const { id } = await fixture("seed-console-copies", modelId);
  await page.goto(`/app/consoles/${id}`);
  await page.getByLabel("File purpose").selectOption("CUSTOM_MODEL");
  const bytes = modelFixture().bytes;
  await page.getByLabel("Choose override file", { exact: true }).setInputFiles({
    name: "production.glb",
    mimeType: "model/gltf-binary",
    buffer: bytes,
  });
  await page.getByRole("button", { name: "Upload file", exact: true }).click();
  const model = page
    .getByRole("list", { name: "Copy overrides" })
    .getByRole("listitem")
    .filter({ hasText: "production.glb" });
  await expect(model).toBeVisible({ timeout: 30000 });
  await model
    .getByRole("button", { name: "Use for this copy", exact: true })
    .click();
  const url = (await page
    .getByRole("link", { name: "Download 3D file", exact: true })
    .getAttribute("href"))!;
  const range = await page.request.get(url, {
    headers: { Range: "bytes=0-7" },
  });
  expect(range.status()).toBe(206);
  expect(range.headers()["content-range"]).toBe(`bytes 0-7/${bytes.length}`);
  expect(await range.body()).toEqual(bytes.subarray(0, 8));
  const viewer = page.getByRole("region", { name: "3D preview", exact: true });
  await viewer.getByRole("button", { name: "View in 3D", exact: true }).click();
  await expect(viewer.getByRole("status")).toHaveText("3D preview ready", {
    timeout: 30000,
  });
  expect((await request.get(url)).status()).toBe(401);

  const published = await fixture("seed-public-detail");
  const detail = await request.get(`/collection/consoles/${published.ids[0]}`);
  expect(detail.status()).toBe(200);
  expect(await detail.text()).not.toContain("PRIVATE-SERIAL");
  const publicPhoto = await request.get(published.imageUrl, {
    headers: { Range: "bytes=0-7" },
  });
  expect(publicPhoto.status()).toBe(206);
  expect(publicPhoto.headers()["content-range"]).toBe(
    `bytes 0-7/${published.photoSize}`,
  );
  expect(publicPhoto.headers()["cache-control"]).toContain("no-store");
  const raw = await request.get(
    `/${process.env.S3_BUCKET}/assets/00000000-0000-4000-8000-000000000022/00000000-0000-4000-8000-000000000001.png`,
    { headers: { Host: "storage.test" } },
  );
  expect([403, 404]).toContain(raw.status());
  await fixture("public-revoke-asset", published.imageAssetId);
  expect((await request.get(published.imageUrl)).status()).toBe(404);
  expect((await page.request.get(privateUrl)).status()).toBe(200);
  await fixture("revoke", email);
  expect((await page.request.get(privateUrl)).status()).toBe(401);
});
