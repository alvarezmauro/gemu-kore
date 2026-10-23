import { execFile, spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { parseArgs, parseEnv, promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { decryptFile, encryptFile, fileDigest, readKey } from "./crypto.mjs";

const exec = promisify(execFile);
const retained = {
  garage1_data: "garage1.tgz",
  garage2_data: "garage2.tgz",
  garage3_data: "garage3.tgz",
  proxy_data: "proxy-data.tgz",
  proxy_config: "proxy-config.tgz",
};
const payloads = [
  "database.dump",
  "environment.env",
  ...Object.values(retained),
];
const sourceFiles = [
  "docker-compose.production.yml",
  "docker/postgres/production-init.sh",
  "docker/garage/garage.toml",
  "docker/garage/setup.mjs",
  "docker/proxy/Caddyfile",
  "docker/proxy/routes.caddy",
];
const within = (parent, child) => {
  const path = relative(parent, child);
  return path === "" || (!path.startsWith("..") && !isAbsolute(path));
};
const requiredName = (name) => /^[a-z0-9][a-z0-9-]{2,100}$/.test(name ?? "");
const timeout = Number(process.env.BACKUP_TIMEOUT_SECONDS ?? 3600) * 1000;
let phase = "configuration";
const cancellation = new AbortController();

async function command(args, options = {}) {
  return exec("docker", args, {
    timeout,
    maxBuffer: 8 * 1024 * 1024,
    signal: cancellation.signal,
    ...options,
  });
}

// Streams archives directly; database contents, credentials and object names never
// enter a command argument or a diagnostic. Inspect no child-process error object.
async function transfer(args, { input, output, env }) {
  const child = spawn("docker", args, {
    env,
    stdio: [input ? "pipe" : "ignore", output ? "pipe" : "ignore", "ignore"],
    timeout,
    signal: cancellation.signal,
  });
  const completion = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) =>
      code === 0
        ? resolve()
        : reject(new Error("Docker archive/database operation failed.")),
    );
  });
  const streams = [];
  if (input) streams.push(pipeline(createReadStream(input), child.stdin));
  if (output)
    streams.push(
      pipeline(
        child.stdout,
        createWriteStream(output, { flags: "wx", mode: 0o600 }),
      ),
    );
  try {
    await Promise.all([completion, ...streams]);
  } catch (error) {
    child.kill("SIGTERM");
    await Promise.allSettled([completion, ...streams]);
    throw error;
  }
}

async function context(envFile, options = {}) {
  const source = await readFile(envFile, "utf8");
  const values = parseEnv(source);
  const env = { ...process.env };
  // Explicit file values, including Compose's ${VAR} expansion, win over the
  // calling shell. Never inherit an unrelated personal database or volume prefix.
  const managed = parseEnv(await readFile(".env.production.example", "utf8"));
  for (const key of new Set([...Object.keys(values), ...Object.keys(managed)]))
    delete env[key];
  const args = [
    "compose",
    "--env-file",
    resolve(envFile),
    "-f",
    "docker-compose.production.yml",
  ];
  if (options["project-name"])
    args.push("--project-name", options["project-name"]);
  for (const file of options["compose-file"] ?? [])
    args.push("-f", resolve(file));
  const { stdout } = await command(
    [...args, "--profile", "tools", "config", "--format", "json"],
    { env },
  );
  const config = JSON.parse(stdout);
  const expectedVolumes = ["postgres_data", ...Object.keys(retained)].sort();
  if (
    JSON.stringify(Object.keys(config.volumes).sort()) !==
      JSON.stringify(expectedVolumes) ||
    Object.values(config.volumes).some((volume) => !volume.external)
  )
    throw new Error(
      "Backup supports the six-volume production deployment only.",
    );
  return {
    source,
    values,
    env,
    args,
    config,
    run: async (rest, recovery = false) =>
      command([...args, ...rest], {
        env,
        ...(recovery ? { signal: undefined } : {}),
      }),
  };
}

async function configDigests() {
  return Object.fromEntries(
    await Promise.all(
      sourceFiles.map(async (file) => [file, (await fileDigest(file)).sha256]),
    ),
  );
}

async function volumeMissing(name, env) {
  const { stdout } = await command(["volume", "ls", "--format", "{{.Name}}"], {
    env,
  });
  return !stdout.trim().split("\n").includes(name);
}

function volumeTool(image, name, readOnly) {
  return [
    "run",
    "--rm",
    ...(!readOnly ? ["--interactive"] : []),
    "--network",
    "none",
    "--read-only",
    "--cap-drop",
    "ALL",
    ...(readOnly ? [] : ["--cap-add", "CHOWN", "--cap-add", "FOWNER"]),
    "--security-opt",
    "no-new-privileges:true",
    "--mount",
    `type=volume,src=${name},dst=/volume${readOnly ? ",readonly" : ""}`,
    "--entrypoint",
    "tar",
    image,
  ];
}

export async function verifyBundle(
  directory,
  key,
  workspace,
  creating = false,
) {
  const label = basename(directory);
  const id = creating
    ? label.replace(/^\./, "").replace(/\.incomplete$/, "")
    : label;
  if (
    !/^[a-f0-9]{16}-[0-9TZ-]+-[a-f0-9-]{36}$/.test(id) ||
    !(await lstat(directory)).isDirectory()
  )
    throw new Error(
      "Choose a completed backup set with its original directory name.",
    );
  const entries = await readdir(directory);
  const names = ["manifest.json", ...payloads];
  if (
    entries.length !== names.length ||
    !names.every((name) => entries.includes(`${name}.enc`))
  )
    throw new Error("Unexpected backup contents.");
  await decryptFile(
    join(directory, "manifest.json.enc"),
    join(workspace, "manifest.json"),
    key,
    "manifest.json",
  );
  if ((await lstat(join(workspace, "manifest.json"))).size > 65536)
    throw new Error("Invalid backup manifest.");
  const manifest = JSON.parse(
    await readFile(join(workspace, "manifest.json"), "utf8"),
  );
  if (
    manifest.version !== 1 ||
    manifest.id !== id ||
    !manifest.installation ||
    !manifest.files ||
    Object.keys(manifest.files).length !== payloads.length
  )
    throw new Error("Unsupported backup manifest.");
  for (const name of payloads) {
    await decryptFile(
      join(directory, `${name}.enc`),
      join(workspace, name),
      key,
      name,
    );
    const actual = await fileDigest(join(workspace, name));
    if (
      actual.sha256 !== manifest.files[name]?.sha256 ||
      actual.size !== manifest.files[name]?.size
    )
      throw new Error("Backup checksum mismatch.");
  }
  return manifest;
}

export async function retain(directory, installation, key, keep, workRoot) {
  const candidates = (await readdir(directory))
    .filter((name) =>
      new RegExp(`^${installation}-[0-9TZ-]+-[a-f0-9-]{36}$`).test(name),
    )
    .sort()
    .reverse();
  let valid = 0;
  for (const name of candidates) {
    const path = join(directory, name);
    if (!(await lstat(path)).isDirectory()) continue;
    const temporary = await mkdtemp(join(workRoot, "retention-"));
    try {
      await decryptFile(
        join(path, "manifest.json.enc"),
        join(temporary, "manifest.json"),
        key,
        "manifest.json",
      );
      const manifest = JSON.parse(
        await readFile(join(temporary, "manifest.json"), "utf8"),
      );
      if (
        manifest.installation === installation &&
        manifest.id === name &&
        ++valid > keep
      )
        await rm(path, { recursive: true });
    } catch {
      /* Unverifiable, foreign and older-key backups are never pruned. */
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  }
}

async function createBackup(options, workspace, key) {
  const ctx = await context(options["env-file"] ?? ".env.production", options);
  const directory = resolve(
    options.directory ?? ctx.values.BACKUP_DIRECTORY ?? "",
  );
  if (
    !(options.directory ?? ctx.values.BACKUP_DIRECTORY) ||
    within(await realpath(process.cwd()), directory)
  )
    throw new Error("Choose a backup directory outside the checkout.");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  if (within(await realpath(process.cwd()), await realpath(directory)))
    throw new Error("Backups cannot resolve inside the checkout.");
  if (
    within(
      await realpath(directory),
      await realpath(options["key-file"] ?? ctx.values.BACKUP_KEY_FILE),
    )
  )
    throw new Error("Keep the encryption key outside the backup directory.");
  const keep = Number(options.keep ?? ctx.values.BACKUP_KEEP_COUNT ?? 14);
  if (!Number.isSafeInteger(keep) || keep < 1 || keep > 365)
    throw new Error("Retention must be between 1 and 365 successful backups.");
  const prefix = ctx.values.PRODUCTION_VOLUME_PREFIX ?? "gemukore-production";
  const installation = createHash("sha256")
    .update(
      `${prefix}:${ctx.values.POSTGRES_DB ?? "gemukore"}:${ctx.values.S3_BUCKET}`,
    )
    .digest("hex")
    .slice(0, 16);
  const id = `${installation}-${new Date()
    .toISOString()
    .replaceAll(":", "-")
    .replace(/\.\d+Z$/, "Z")}-${randomUUID()}`;
  const partial = join(directory, `.${id}.incomplete`);
  const destination = join(directory, id);
  const lock = join(tmpdir(), `.gemukore-${installation}-backup.lock`);
  await mkdir(lock, { mode: 0o700 }); // Atomic cross-process lock; stale locks require operator review.
  let paused = false,
    completed = false;
  const running = [];
  try {
    phase = "backup preflight";
    const { stdout: ids } = await command(
      [
        "ps",
        "--quiet",
        "--filter",
        `label=com.docker.compose.project=${ctx.config.name}`,
      ],
      { env: ctx.env },
    );
    const containers = ids.trim()
      ? JSON.parse(
          (
            await command(["inspect", ...ids.trim().split("\n")], {
              env: ctx.env,
            })
          ).stdout,
        )
      : [];
    for (const service of [
      "app",
      "proxy",
      "postgres",
      "garage1",
      "garage2",
      "garage3",
    ]) {
      const found = containers.find(
        (item) => item.Config.Labels["com.docker.compose.service"] === service,
      );
      if (!found || found.State.Health?.Status !== "healthy")
        throw new Error("Start a healthy production stack before backup.");
      running.push(service);
      for (const mount of found.Mounts.filter(
        (item) => item.Type === "volume",
      )) {
        if (
          !Object.values(ctx.config.volumes).some(
            (volume) => volume.name === mount.Name,
          )
        )
          throw new Error("The running stack uses different volumes.");
      }
    }
    if (
      containers.some((item) =>
        ["operations", "migrate", "storage-init"].includes(
          item.Config.Labels["com.docker.compose.service"],
        ),
      )
    )
      throw new Error("Finish operator jobs before backup.");
    await mkdir(partial, { mode: 0o700 });
    phase = "maintenance snapshot";
    paused = true;
    // Keep Caddy's S3 route available while Next.js drains in-flight uploads.
    await ctx.run(["stop", "--timeout", "60", "app"]);
    await ctx.run(["stop", "--timeout", "60", "proxy"]);
    await ctx.run(["stop", "--timeout", "60", "garage1", "garage2", "garage3"]);
    // Domain writers and the S3 API are stopped before the database snapshot.
    await transfer(
      [
        ...ctx.args,
        "exec",
        "-T",
        "postgres",
        "pg_dump",
        "-U",
        "postgres",
        "--format=custom",
        "--no-owner",
        "--no-acl",
        "--dbname",
        ctx.values.POSTGRES_DB ?? "gemukore",
      ],
      { output: join(workspace, "database.dump"), env: ctx.env },
    );
    await writeFile(join(workspace, "environment.env"), ctx.source, {
      mode: 0o600,
    });
    const helper = ctx.config.services.postgres.image;
    for (const [volume, name] of Object.entries(retained)) {
      await transfer(
        [
          ...volumeTool(helper, ctx.config.volumes[volume].name, true),
          "-czf",
          "-",
          "-C",
          "/volume",
          ".",
        ],
        { output: join(workspace, name), env: ctx.env },
      );
    }
    phase = "service recovery";
    await ctx.run(
      [
        "start",
        "--wait",
        "--wait-timeout",
        "180",
        "garage1",
        "garage2",
        "garage3",
      ],
      true,
    );
    await ctx.run(
      ["start", "--wait", "--wait-timeout", "180", "app", "proxy"],
      true,
    );
    paused = false;
    cancellation.signal.throwIfAborted();
    phase = "backup encryption";
    const files = {};
    for (const name of payloads) {
      cancellation.signal.throwIfAborted();
      files[name] = await fileDigest(join(workspace, name));
      await encryptFile(
        join(workspace, name),
        join(partial, `${name}.enc`),
        key,
        name,
      );
    }
    const revision = (
      await exec("git", ["rev-parse", "HEAD"], { encoding: "utf8" })
    ).stdout.trim();
    const architecture = (
      await command(["info", "--format", "{{.Architecture}}"], { env: ctx.env })
    ).stdout.trim();
    const manifest = {
      version: 1,
      id,
      installation,
      createdAt: new Date().toISOString(),
      sourcePrefix: prefix,
      revision,
      dirtyCheckout: Boolean(
        (await exec("git", ["status", "--porcelain"])).stdout.trim(),
      ),
      architecture,
      images: Object.fromEntries(
        Object.entries(ctx.config.services).map(([name, service]) => [
          name,
          service.image,
        ]),
      ),
      configuration: await configDigests(),
      files,
    };
    await writeFile(
      join(workspace, "manifest.json"),
      JSON.stringify(manifest),
      { mode: 0o600 },
    );
    await encryptFile(
      join(workspace, "manifest.json"),
      join(partial, "manifest.json.enc"),
      key,
      "manifest.json",
    );
    phase = "backup authentication";
    const check = await mkdtemp(join(workspace, "verify-"));
    await verifyBundle(partial, key, check, true);
    cancellation.signal.throwIfAborted();
    const stagedDirectory = await open(partial, "r");
    try {
      await stagedDirectory.sync();
    } finally {
      await stagedDirectory.close();
    }
    await rename(partial, destination);
    const parentDirectory = await open(directory, "r");
    try {
      await parentDirectory.sync();
    } finally {
      await parentDirectory.close();
    }
    completed = true;
    await retain(directory, installation, key, keep, workspace);
    return { directory: destination };
  } finally {
    if (paused) {
      // Always attempt recovery even when dump/archive/encryption fails.
      await ctx.run(
        [
          "start",
          "--wait",
          "--wait-timeout",
          "180",
          ...running.filter((name) => name.startsWith("garage")),
        ],
        true,
      );
      await ctx.run(
        [
          "start",
          "--wait",
          "--wait-timeout",
          "180",
          ...running.filter((name) => ["app", "proxy"].includes(name)),
        ],
        true,
      );
    }
    if (!completed) await rm(partial, { recursive: true, force: true });
    await rm(lock, { recursive: true });
  }
}

function setValue(source, key, value) {
  const matches = source.match(new RegExp(`^${key}=.*$`, "gm")) ?? [];
  if (matches.length > 1)
    throw new Error("Duplicate recovery configuration assignment.");
  return matches.length
    ? source.replace(new RegExp(`^${key}=.*$`, "m"), `${key}=${value}`)
    : `${source}\n${key}=${value}\n`;
}

async function restoreBackup(options, workspace, key) {
  phase = "restore authentication";
  const manifest = await verifyBundle(
    resolve(options.directory),
    key,
    workspace,
  );
  const prefix = options["volume-prefix"];
  const output = options["env-output"] && resolve(options["env-output"]);
  if (!requiredName(prefix) || prefix === manifest.sourcePrefix || !output)
    throw new Error(
      "Choose a new volume prefix and a new recovery environment file.",
    );
  if (
    JSON.stringify(manifest.configuration) !==
    JSON.stringify(await configDigests())
  )
    throw new Error(
      "Use the matching deployment configuration recorded in the backup.",
    );
  if (
    (await command(["info", "--format", "{{.Architecture}}"])).stdout.trim() !==
    manifest.architecture
  )
    throw new Error(
      "Garage volume recovery requires the original architecture.",
    );
  let source = await readFile(join(workspace, "environment.env"), "utf8");
  source = setValue(source, "PRODUCTION_VOLUME_PREFIX", prefix);
  source = setValue(source, "PRODUCTION_PROJECT_NAME", prefix);
  source = setValue(source, "PROXY_BIND_ADDRESS", "127.0.0.1");
  source = setValue(source, "HTTP_PORT", "18080");
  source = setValue(source, "HTTPS_PORT", "18443");
  // wx refuses every existing target, including symlinks. App/proxy stay stopped.
  const outputFile = await open(output, "wx", 0o600);
  await outputFile.writeFile(source);
  await outputFile.close();
  const ctx = await context(output, {
    "compose-file": options["compose-file"],
  });
  if (
    ctx.config.name !== prefix ||
    Object.values(ctx.config.volumes).some(
      (volume) => !volume.name.startsWith(`${prefix}-`),
    )
  )
    throw new Error(
      "Recovery configuration must use the requested fresh project and volume prefix.",
    );
  const existing = (
    await command(
      [
        "ps",
        "--all",
        "--quiet",
        "--filter",
        `label=com.docker.compose.project=${prefix}`,
      ],
      { env: ctx.env },
    )
  ).stdout.trim();
  if (existing) throw new Error("The recovery project already has containers.");
  const planned = Object.values(ctx.config.volumes).map(
    (volume) => volume.name,
  );
  for (const name of planned)
    if (!(await volumeMissing(name, ctx.env)))
      throw new Error("Recovery requires entirely new volumes.");
  if (
    ctx.config.services.garage1.image !== manifest.images.garage1 ||
    ctx.config.services.postgres.image !== manifest.images.postgres
  )
    throw new Error(
      "Restore with the recorded Garage and PostgreSQL versions.",
    );
  const operation = randomUUID();
  phase = "fresh volume creation";
  for (const name of planned) {
    await command(
      ["volume", "create", "--label", `gemukore.restore=${operation}`, name],
      { env: ctx.env },
    );
    const label = (
      await command(
        [
          "volume",
          "inspect",
          "--format",
          '{{index .Labels "gemukore.restore"}}',
          name,
        ],
        { env: ctx.env },
      )
    ).stdout.trim();
    if (label !== operation)
      throw new Error(
        "A recovery volume was created concurrently; nothing was overwritten.",
      );
  }
  phase = "asset volume restore";
  for (const [volume, name] of Object.entries(retained)) {
    phase = `asset volume restore (${volume})`;
    await transfer(
      [
        ...volumeTool(
          ctx.config.services.postgres.image,
          ctx.config.volumes[volume].name,
          false,
        ),
        "-xzf",
        "-",
        "-C",
        "/volume",
      ],
      { input: join(workspace, name), env: ctx.env },
    );
  }
  phase = "database restore";
  await ctx.run([
    "up",
    "--detach",
    "--wait",
    "--wait-timeout",
    "180",
    "--no-deps",
    "postgres",
  ]);
  const { stdout: count } = await ctx.run([
    "exec",
    "-T",
    "postgres",
    "psql",
    "-U",
    "postgres",
    "-d",
    ctx.values.POSTGRES_DB ?? "gemukore",
    "-tAc",
    "SELECT count(*) FROM pg_tables WHERE schemaname = 'public'",
  ]);
  if (count.trim() !== "0")
    throw new Error("The recovery database is not empty.");
  await transfer(
    [
      ...ctx.args,
      "exec",
      "-T",
      "postgres",
      "pg_restore",
      "-U",
      "postgres",
      "--role=gemukore_migrator",
      "--clean",
      "--if-exists",
      "--no-owner",
      "--no-acl",
      "--single-transaction",
      "--exit-on-error",
      "--dbname",
      ctx.values.POSTGRES_DB ?? "gemukore",
    ],
    { input: join(workspace, "database.dump"), env: ctx.env },
  );
  await transfer(
    [
      ...ctx.args,
      "exec",
      "-T",
      "postgres",
      "psql",
      "-U",
      "postgres",
      "-d",
      ctx.values.POSTGRES_DB ?? "gemukore",
      "--set",
      "ON_ERROR_STOP=1",
    ],
    { input: resolve("scripts/backup/restore-access.sql"), env: ctx.env },
  );
  phase = "storage quorum verification";
  await ctx.run([
    "up",
    "--detach",
    "--wait",
    "--wait-timeout",
    "180",
    "garage1",
    "garage2",
    "garage3",
  ]);
  await ctx.run(["run", "--rm", "--no-deps", "storage-init"]);
  return {
    environment: output,
    project: prefix,
    status: "Data restored; application and proxy remain stopped for review.",
  };
}

export async function main(argv = process.argv.slice(2)) {
  const { values: options, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      "env-file": { type: "string" },
      "key-file": { type: "string" },
      directory: { type: "string" },
      keep: { type: "string" },
      "volume-prefix": { type: "string" },
      "env-output": { type: "string" },
      "project-name": { type: "string" },
      "compose-file": { type: "string", multiple: true },
    },
  });
  const [action] = positionals;
  if (!["create", "verify", "restore"].includes(action))
    throw new Error("Use create, verify or restore.");
  const envValues =
    action === "create"
      ? parseEnv(
          await readFile(options["env-file"] ?? ".env.production", "utf8"),
        )
      : {};
  const key = await readKey(options["key-file"] ?? envValues.BACKUP_KEY_FILE);
  const workspace = await mkdtemp(
    join(process.env.BACKUP_WORK_DIRECTORY ?? tmpdir(), "gemukore-backup-"),
  );
  await chmod(workspace, 0o700);
  try {
    if (action === "create") return await createBackup(options, workspace, key);
    if (action === "restore")
      return await restoreBackup(options, workspace, key);
    phase = "backup authentication";
    const manifest = await verifyBundle(
      resolve(options.directory),
      key,
      workspace,
    );
    return {
      status: "Backup authentication and checksums passed.",
      id: manifest.id,
      createdAt: manifest.createdAt,
      revision: manifest.revision,
      dirtyCheckout: manifest.dirtyCheckout,
      architecture: manifest.architecture,
      images: manifest.images,
    };
  } finally {
    key.fill(0);
    await rm(workspace, { recursive: true, force: true });
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))
) {
  for (const signal of ["SIGINT", "SIGTERM"])
    process.once(signal, () => cancellation.abort());
  main()
    .then((result) => console.info(JSON.stringify(result)))
    .catch(() => {
      console.error(
        `Backup operation failed during ${phase}. Check private configuration, free space, the backup key and Docker service status. Existing backup sets and source data were preserved; a failed recovery target stays offline for review.`,
      );
      process.exitCode = 1;
    });
}
