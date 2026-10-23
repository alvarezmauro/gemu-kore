import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync, renameSync, unlinkSync } from "node:fs";
import { parseEnv } from "node:util";

const file = process.argv[2] ?? ".env.production";
const temporary = `${file}.storage-pending-${randomUUID()}`;
const pending = "PROVISION_WITH_GARAGE";
let createdTemporary = false;
try {
  const source = readFileSync(file, "utf8");
  const config = parseEnv(source);
  const fields = ["S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"];
  const isPending = fields.every((key) => config[key] === pending);
  if (
    !isPending &&
    fields.some((key) => !config[key] || config[key] === pending)
  )
    throw new Error("Incomplete storage credentials");
  for (const field of fields) {
    if ((source.match(new RegExp(`^${field}=.*$`, "gm")) ?? []).length !== 1)
      throw new Error("Review storage assignments");
    if (isPending && !new RegExp(`^${field}=${pending}\\s*$`, "m").test(source))
      throw new Error("Review storage markers");
  }
  const args = [
    "compose",
    "--env-file",
    file,
    "-f",
    "docker-compose.production.yml",
    ...process.argv.slice(3),
  ];
  const run = (command) =>
    execFileSync("docker", [...args, ...command], {
      env: { ...process.env, ...config },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 180000,
    });
  run(["up", "--detach", "--wait", "garage1", "garage2", "garage3"]);
  const key = JSON.parse(
    run(["run", "--rm", "--no-deps", "storage-init", "--provision"]).trim(),
  );
  if (
    !/^GK[a-f0-9]+$/.test(key.accessKeyId) ||
    !/^[a-f0-9]{64}$/.test(key.secretAccessKey)
  )
    throw new Error("Unexpected generated credentials");
  if (isPending) {
    let updated = source;
    for (const [field, value] of [
      [fields[0], key.accessKeyId],
      [fields[1], key.secretAccessKey],
    ]) {
      const assignment = new RegExp(`^${field}=${pending}\\s*$`, "m");
      if (!assignment.test(updated))
        throw new Error("Review storage assignments");
      updated = updated.replace(assignment, `${field}=${value}`);
    }
    // No silent replacement of a file changed by an operator during provisioning.
    if (readFileSync(file, "utf8") !== source)
      throw new Error("Configuration changed");
    writeFileSync(temporary, updated, { mode: 0o600, flag: "wx" });
    createdTemporary = true;
    renameSync(temporary, file);
  }
  console.info(
    isPending
      ? "Garage application credentials saved privately. Start the deployment next."
      : "Existing Garage credentials verified and preserved.",
  );
} catch {
  // Child-process output contains the generated key; never print the error object.
  console.error(
    "Storage provisioning failed. Check the private configuration and Garage status. Existing credentials were not replaced.",
  );
  process.exitCode = 1;
} finally {
  if (createdTemporary) {
    try {
      unlinkSync(temporary);
    } catch {
      /* Atomic rename already removed it. */
    }
  }
}
