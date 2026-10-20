import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { expect, type BrowserContext, type Page } from "@playwright/test";
import { signedSessionCookie } from "./access-session";
import { modelFixture } from "./model-fixture";
const exec = promisify(execFile);
export async function fixture(command: string, argument?: string) {
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
    { env: { ...process.env, NODE_ENV: "production" }, timeout: 15000 },
  );
  return JSON.parse(stdout.trim());
}
export async function signIn(
  context: BrowserContext,
  role: "ADMIN" | "EDITOR" | "VIEWER" = "EDITOR",
) {
  const identity = await fixture("sign-in", JSON.stringify({ role }));
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
  return identity;
}
export async function prepareModel(
  page: Page,
  context: BrowserContext,
  bytes = modelFixture().bytes,
) {
  const identity = await signIn(context);
  const { modelId } = await fixture("seed-console-creation");
  const { id } = await fixture("seed-console-copies", modelId);
  await page.goto(`/app/consoles/${id}`);
  await page.getByLabel("File purpose").selectOption("CUSTOM_MODEL");
  await page.getByLabel("Choose override file", { exact: true }).setInputFiles({
    name: "synthetic-console.glb",
    mimeType: "model/gltf-binary",
    buffer: bytes,
  });
  await page.getByRole("button", { name: "Upload file", exact: true }).click();
  const model = page
    .getByRole("list", { name: "Copy overrides" })
    .getByRole("listitem")
    .filter({ hasText: "synthetic-console.glb" });
  await expect(model).toBeVisible({ timeout: 20000 });
  await model
    .getByRole("button", { name: "Use for this copy", exact: true })
    .click();
  const viewer = page.getByRole("region", { name: "3D preview", exact: true });
  await expect(viewer).toBeVisible();
  const url = (await page
    .getByRole("link", { name: "Download 3D file", exact: true })
    .getAttribute("href"))!;
  return { viewer, url, id, identity };
}
export async function openModel(page: Page) {
  const viewer = page.getByRole("region", { name: "3D preview", exact: true });
  await viewer.getByRole("button", { name: "View in 3D", exact: true }).click();
  await expect(viewer.getByRole("status")).toHaveText("3D preview ready", {
    timeout: 20000,
  });
  return viewer;
}
