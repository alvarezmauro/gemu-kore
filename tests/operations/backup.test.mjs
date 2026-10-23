import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";
import {
  decryptFile,
  encryptFile,
  fileDigest,
  readKey,
} from "../../scripts/backup/crypto.mjs";
import { retain, verifyBundle } from "../../scripts/backup/production.mjs";

test("backup encryption authenticates streamed data, filename and key before recovery", async () => {
  const directory = await mkdtemp(join(tmpdir(), "gemukore-crypto-test-"));
  const file = (name) => join(directory, name);
  const key = randomBytes(32),
    bytes = randomBytes(2 * 1024 * 1024 + 17);
  try {
    await writeFile(file("source"), bytes, { mode: 0o600 });
    await encryptFile(file("source"), file("encrypted"), key, "database.dump");
    assert.equal((await stat(file("encrypted"))).mode & 0o777, 0o600);
    assert.equal(
      (await readFile(file("encrypted"))).includes(bytes.subarray(0, 128)),
      false,
    );
    await decryptFile(
      file("encrypted"),
      file("recovered"),
      key,
      "database.dump",
    );
    assert.deepEqual(
      await fileDigest(file("recovered")),
      await fileDigest(file("source")),
    );
    await assert.rejects(
      decryptFile(
        file("encrypted"),
        file("wrong-key"),
        randomBytes(32),
        "database.dump",
      ),
    );
    await assert.rejects(stat(file("wrong-key")));
    await assert.rejects(
      decryptFile(
        file("encrypted"),
        file("wrong-name"),
        key,
        "environment.env",
      ),
    );
    const damaged = await readFile(file("encrypted"));
    damaged[damaged.length - 20] ^= 1;
    await writeFile(file("damaged"), damaged);
    await assert.rejects(
      decryptFile(file("damaged"), file("bad-data"), key, "database.dump"),
    );
    await assert.rejects(stat(file("bad-data")));
    await writeFile(file("truncated"), damaged.subarray(0, 20));
    await assert.rejects(
      decryptFile(file("truncated"), file("bad-header"), key, "database.dump"),
    );
    // Never overwrite a caller's existing recovery file.
    await assert.rejects(
      decryptFile(file("encrypted"), file("recovered"), key, "database.dump"),
    );
    assert.deepEqual(await readFile(file("recovered")), bytes);
    await writeFile(file("empty"), "");
    await encryptFile(file("empty"), file("empty.enc"), key, "empty");
    await decryptFile(file("empty.enc"), file("empty.restored"), key, "empty");
    assert.equal((await stat(file("empty.restored"))).size, 0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("encryption keys require a private file and valid hexadecimal bytes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "gemukore-key-test-"));
  const path = join(directory, "key");
  try {
    const key = randomBytes(32);
    await writeFile(path, key.toString("hex"), { mode: 0o600 });
    assert.deepEqual(await readKey(path), key);
    await chmod(path, 0o644);
    await assert.rejects(readKey(path));
    await chmod(path, 0o600);
    await writeFile(path, "invalid");
    await assert.rejects(readKey(path));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("complete backup sets are verified and retention preserves other keys", async () => {
  const root = await mkdtemp(join(tmpdir(), "gemukore-set-test-"));
  const key = randomBytes(32),
    installation = "0123456789abcdef";
  const names = [
    "database.dump",
    "environment.env",
    "garage1.tgz",
    "garage2.tgz",
    "garage3.tgz",
    "proxy-data.tgz",
    "proxy-config.tgz",
  ];
  const sets = [];
  try {
    const plain = join(root, "plain");
    await writeFile(plain, "synthetic fixture", { mode: 0o600 });
    for (let day = 1; day <= 4; day++) {
      const id = `${installation}-2026-10-0${day}T00-00-00Z-00000000-0000-4000-8000-00000000000${day}`;
      const path = join(root, id);
      await mkdir(path);
      sets.push(path);
      const actualKey = day === 4 ? randomBytes(32) : key;
      const files = {};
      for (const name of names) {
        files[name] = await fileDigest(plain);
        await encryptFile(plain, join(path, `${name}.enc`), actualKey, name);
      }
      const manifest = join(root, `manifest-${day}`);
      await writeFile(
        manifest,
        JSON.stringify({ version: 1, id, installation, files }),
      );
      await encryptFile(
        manifest,
        join(path, "manifest.json.enc"),
        actualKey,
        "manifest.json",
      );
    }
    const work = await mkdtemp(join(root, "verify-"));
    assert.equal(
      (await verifyBundle(sets[0], key, work)).installation,
      installation,
    );
    await writeFile(join(sets[0], "unexpected.enc"), "not a member");
    await assert.rejects(
      verifyBundle(sets[0], key, await mkdtemp(join(root, "bad-"))),
    );
    await rm(join(sets[0], "unexpected.enc"));
    await retain(root, installation, key, 2, root);
    await assert.rejects(stat(sets[0]));
    for (const path of sets.slice(1))
      assert.ok((await stat(path)).isDirectory());
    assert.equal(
      (await readdir(root)).some((name) => name.endsWith(".lock")),
      false,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
