import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import { test, expect } from "@playwright/test";
import { signedSessionCookie } from "../helpers/access-session";

test("restored database authorizes real restored photo and GLB bytes", async ({
  page,
  context,
  request,
}) => {
  test.skip(
    !process.env.PRODUCTION_RESTORE_FIXTURE,
    "Runs after the backup round trip.",
  );
  const fixture = JSON.parse(process.env.PRODUCTION_RESTORE_FIXTURE!);
  const { stdout } = await promisify(execFile)(
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
      "sign-in",
      JSON.stringify({
        role: "EDITOR",
        email: `restore-${randomUUID()}@example.com`,
      }),
    ],
    { timeout: 30000 },
  );
  const identity = JSON.parse(stdout.trim());
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
  await page.goto("/app");
  await expect(page).toHaveURL(/\/app$/);
  const photo = await page.request.get(`/api/media/private/${fixture.photoId}`);
  expect(photo.status()).toBe(200);
  expect(photo.headers()["content-type"]).toBe("image/webp");
  expect(photo.headers()["cache-control"]).toContain("no-store");
  const glb = await page.request.get(`/api/media/private/${fixture.modelId}`, {
    headers: { Range: "bytes=0-7" },
  });
  expect(glb.status()).toBe(206);
  expect((await glb.body()).subarray(0, 4).toString()).toBe("glTF");
  expect(
    (await request.get(`/api/media/private/${fixture.photoId}`)).status(),
  ).toBe(401);
});
