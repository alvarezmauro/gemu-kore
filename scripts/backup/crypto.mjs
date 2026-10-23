import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { lstat, open, readFile, rm } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

const magic = Buffer.from("GEMU-BACKUP-1\n");
const headerSize = magic.length + 12;

export async function readKey(path) {
  const info = await lstat(path);
  if (!info.isFile() || info.mode & 0o077)
    throw new Error("Use a private regular key file (mode 600).");
  const text = (await readFile(path, "utf8")).trim();
  if (!/^[a-f0-9]{64}$/i.test(text))
    throw new Error(
      "The backup key must contain 32 random bytes in hexadecimal.",
    );
  return Buffer.from(text, "hex");
}

export async function fileDigest(path) {
  const hash = createHash("sha256");
  let size = 0;
  for await (const bytes of createReadStream(path)) {
    hash.update(bytes);
    size += bytes.length;
  }
  return { sha256: hash.digest("hex"), size };
}

export async function encryptFile(source, destination, key, name) {
  // GCM's per-message plaintext limit (NIST SP 800-38D, 5.2.1.1).
  if ((await lstat(source)).size > 2 ** 36 - 32)
    throw new Error(
      "An individual compressed backup payload exceeds the format limit.",
    );
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(name));
  const output = createWriteStream(destination, { flags: "wx", mode: 0o600 });
  let created = false;
  output.once("open", () => {
    created = true;
  });
  try {
    await pipeline(
      createReadStream(source),
      cipher,
      async function* (chunks) {
        yield Buffer.concat([magic, iv]);
        for await (const chunk of chunks) yield chunk;
        yield cipher.getAuthTag();
      },
      output,
    );
    const file = await open(destination, "r+");
    try {
      await file.sync();
    } finally {
      await file.close();
    }
  } catch (error) {
    if (created) await rm(destination, { force: true });
    throw error;
  }
}

export async function decryptFile(source, destination, key, name) {
  const info = await lstat(source);
  if (!info.isFile() || info.size < headerSize + 16)
    throw new Error("Invalid encrypted backup file.");
  const input = await open(source, "r");
  const header = Buffer.alloc(headerSize),
    tag = Buffer.alloc(16);
  try {
    await input.read(header, 0, header.length, 0);
    await input.read(tag, 0, 16, info.size - 16);
  } finally {
    await input.close();
  }
  if (!header.subarray(0, magic.length).equals(magic))
    throw new Error("Unsupported backup format.");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    header.subarray(magic.length),
  );
  decipher.setAAD(Buffer.from(name));
  decipher.setAuthTag(tag);
  const output = createWriteStream(destination, { flags: "wx", mode: 0o600 });
  let created = false;
  output.once("open", () => {
    created = true;
  });
  try {
    await pipeline(
      info.size === headerSize + 16
        ? Readable.from([])
        : createReadStream(source, { start: headerSize, end: info.size - 17 }),
      decipher,
      output,
    );
  } catch {
    if (created) await rm(destination, { force: true });
    throw new Error(
      "Backup authentication failed; check the key and file integrity.",
    );
  }
}
