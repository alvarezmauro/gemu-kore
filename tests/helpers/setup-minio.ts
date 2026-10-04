import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { setTimeout } from "node:timers/promises";
import { promisify } from "node:util";
import type { TestProject } from "vitest/node";
import type { StorageEnvironment } from "../../src/server/config/storage-env";

const exec = promisify(execFile);
declare module "vitest" {
  export interface ProvidedContext {
    storageConfig: StorageEnvironment;
  }
}

export default async function setup(project: TestProject) {
  const name = `gemukore-storage-test-${randomUUID()}`;
  const accessKeyId = randomUUID();
  const secretAccessKey = randomUUID();
  let created = false;
  async function cleanup() {
    if (created) {
      await exec("docker", ["rm", "--force", name]);
      created = false;
    }
  }
  try {
    // Build the same pinned source as development, not an arbitrary cached tag.
    const { stdout: built } = await exec(
      "docker",
      ["build", "--quiet", "docker/minio"],
      { timeout: 300_000 },
    );
    const image = built.trim();
    if (!/^sha256:[0-9a-f]{64}$/.test(image))
      throw new Error("Expected a built MinIO image ID.");
    await exec("docker", [
      "run",
      "--detach",
      "--rm",
      "--name",
      name,
      "--label",
      "gemukore.test=true",
      "--publish",
      "127.0.0.1::9000",
      "--tmpfs",
      "/data:uid=10001,gid=10001",
      "--env",
      `MINIO_ROOT_USER=${accessKeyId}`,
      "--env",
      `MINIO_ROOT_PASSWORD=${secretAccessKey}`,
      "--env",
      "MINIO_REGION_NAME=us-east-1",
      image,
      "server",
      "/data",
    ]);
    created = true;
    const { stdout } = await exec("docker", ["port", name, "9000/tcp"]);
    const address = stdout.trim();
    if (!/^127\.0\.0\.1:\d+$/.test(address))
      throw new Error("Expected loopback-only test storage.");
    const endpoint = `http://${address}`;
    const deadline = Date.now() + 60_000;
    while (true) {
      try {
        const result = await fetch(`${endpoint}/minio/health/ready`, {
          signal: AbortSignal.timeout(1000),
        });
        if (result.ok) break;
      } catch {}
      if (Date.now() >= deadline)
        throw new Error("Test MinIO readiness deadline exceeded.");
      await setTimeout(250);
    }
    project.provide("storageConfig", {
      endpoint,
      region: "us-east-1",
      bucket: `gemukore-test-${randomUUID()}`,
      accessKeyId,
      secretAccessKey,
      forcePathStyle: true,
    });
    return cleanup;
  } catch (error) {
    await cleanup();
    throw error;
  }
}
