import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { setTimeout } from "node:timers/promises";
import { promisify } from "node:util";
import type { TestProject } from "vitest/node";

const exec = promisify(execFile);
// Same PostgreSQL release as development, with independent disposable storage.
const image =
  "postgres:16-alpine@sha256:f4610795587492cd4fb887c2dc3de301b813278bb6f616992061141b5f15ac36";

declare module "vitest" {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}

export async function startTestPostgres() {
  const name = `gemukore-test-${randomUUID()}`;
  const password = randomUUID();
  let created = false;

  async function cleanup() {
    if (created) {
      await exec("docker", ["rm", "--force", name]);
      created = false;
    }
  }

  try {
    await exec("docker", [
      "run",
      "--detach",
      "--rm",
      "--name",
      name,
      "--label",
      "gemukore.test=true",
      "--publish",
      "127.0.0.1::5432",
      "--tmpfs",
      "/var/lib/postgresql/data",
      "--env",
      "POSTGRES_USER=gemukore_test",
      "--env",
      "POSTGRES_DB=gemukore_test",
      "--env",
      `POSTGRES_PASSWORD=${password}`,
      image,
    ]);
    created = true;

    const deadline = Date.now() + 60_000;
    while (true) {
      try {
        // TCP readiness avoids the temporary socket-only initialization server.
        await exec("docker", [
          "exec",
          name,
          "pg_isready",
          "-h",
          "127.0.0.1",
          "-U",
          "gemukore_test",
          "-d",
          "gemukore_test",
        ]);
        break;
      } catch {
        if (Date.now() >= deadline) {
          throw new Error(
            "Test PostgreSQL did not become ready within 60 seconds.",
          );
        }
        await setTimeout(500);
      }
    }

    const { stdout } = await exec("docker", ["port", name, "5432/tcp"]);
    const address = stdout.trim();
    if (!/^127\.0\.0\.1:\d+$/.test(address)) {
      throw new Error("Expected a loopback-only port for test PostgreSQL.");
    }
    const databaseUrl = `postgresql://gemukore_test:${password}@${address}/gemukore_test?schema=public`;
    await exec("pnpm", ["db:deploy"], {
      env: { ...process.env, NODE_ENV: "test", DATABASE_URL: databaseUrl },
      timeout: 60_000,
    });
    return { databaseUrl, cleanup };
  } catch (error) {
    await cleanup();
    throw error;
  }
}

export default async function setup(project: TestProject) {
  const { databaseUrl, cleanup } = await startTestPostgres();
  project.provide("databaseUrl", databaseUrl);
  return cleanup;
}
