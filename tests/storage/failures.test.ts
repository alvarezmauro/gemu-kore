import { createHash, randomUUID } from "node:crypto";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { Readable } from "node:stream";
import { setTimeout as delay } from "node:timers/promises";
import { afterEach, beforeEach, expect, it } from "vitest";
import { createS3ObjectStorage } from "../../src/server/storage/s3";
import { createObjectLocator } from "../../src/server/storage/objects";

const bytes = Buffer.from("test-body-for-replayed-uploads");
const assetId = randomUUID();
const locator = createObjectLocator(assetId, "image/png");
const metadata = {
  assetId,
  sha256: createHash("sha256").update(bytes).digest("hex"),
};
let handler: (
  request: IncomingMessage,
  response: ServerResponse,
) => void | Promise<void>;
let server: ReturnType<typeof createServer>;
let requests = 0;
let config: Parameters<typeof createS3ObjectStorage>[0];
let storage: ReturnType<typeof createS3ObjectStorage>;
function fail(response: ServerResponse, status: number, code: string) {
  response.writeHead(status, { "content-type": "application/xml" });
  response.end(
    `<Error><Code>${code}</Code><Message>private-upstream-error</Message></Error>`,
  );
}
async function consume(body: Readable) {
  const chunks: Buffer[] = [];
  for await (const chunk of body) chunks.push(chunk);
  return Buffer.concat(chunks);
}

beforeEach(async () => {
  requests = 0;
  handler = (_request, response) => fail(response, 503, "SlowDown");
  server = createServer((request, response) => {
    requests++;
    request.on("error", () => {});
    void Promise.resolve(handler(request, response)).catch(() =>
      response.destroy(),
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Missing test server address.");
  config = {
    endpoint: `http://127.0.0.1:${address.port}`,
    region: "us-east-1",
    bucket: "test-bucket",
    accessKeyId: "test-key",
    secretAccessKey: "test-secret",
    forcePathStyle: true,
  };
  storage = createS3ObjectStorage(config);
});
afterEach(async () => {
  storage.close();
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
});

it("reopens the body for transient PUT failures and caps attempts at three", async () => {
  let opened = 0;
  const received: Buffer[] = [];
  handler = async (request, response) => {
    received.push(await consume(request));
    expect(request.headers["x-amz-acl"]).toBeUndefined();
    if (requests < 3) fail(response, 503, "SlowDown");
    else
      response
        .writeHead(200, { "content-length": "0", etag: '"opaque"' })
        .end();
  };
  await expect(
    storage.put({
      locator,
      contentType: "image/png",
      sizeBytes: bytes.length,
      metadata,
      openBody: () => {
        opened++;
        return Readable.from([bytes.subarray(0, 3), bytes.subarray(3)]);
      },
    }),
  ).resolves.toEqual({ sizeBytes: bytes.length, etag: '"opaque"' });
  expect(opened).toBe(3);
  expect(received).toEqual([bytes, bytes, bytes]);
});
it("refuses a replay source whose bytes changed", async () => {
  let opened = 0;
  handler = async (request, response) => {
    await consume(request);
    fail(response, 503, "SlowDown");
  };
  await expect(
    storage.put({
      locator,
      contentType: "image/png",
      sizeBytes: bytes.length,
      metadata,
      openBody: () => {
        opened++;
        return Readable.from([
          opened === 1 ? bytes : Buffer.alloc(bytes.length),
        ]);
      },
    }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  expect(opened).toBe(2);
});
it("does not accept early success before verifying the upload stream", async () => {
  handler = (_request, response) => {
    response.writeHead(200, { "content-length": "0" }).end();
  };
  await expect(
    storage.put({
      locator,
      contentType: "image/png",
      sizeBytes: bytes.length,
      metadata: { ...metadata, sha256: "0".repeat(64) },
      openBody: () => Readable.from([bytes]),
    }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
});
it("normalizes outages after three attempts without treating them as absence", async () => {
  await expect(storage.stat(locator)).rejects.toMatchObject({
    code: "UNAVAILABLE",
    message: "Storage operation is unavailable.",
  });
  expect(requests).toBe(3);
});
it("does not retry denied credentials or disclose provider messages", async () => {
  handler = (_request, response) => fail(response, 403, "AccessDenied");
  await expect(storage.remove(locator)).rejects.toMatchObject({
    code: "ACCESS_DENIED",
    message: "Storage access or configuration failed.",
  });
  expect(requests).toBe(1);
});
it("does not treat a missing bucket as a successfully removed object", async () => {
  handler = (_request, response) => fail(response, 404, "NoSuchBucket");
  await expect(storage.remove(locator)).rejects.toMatchObject({
    code: "ACCESS_DENIED",
  });
});

it("confirms an ambiguous HEAD 404 using the structured GET error", async () => {
  const methods: string[] = [];
  handler = (request, response) => {
    methods.push(request.method!);
    fail(response, 404, request.method === "HEAD" ? "NotFound" : "NoSuchKey");
  };
  await expect(storage.stat(locator)).resolves.toBeNull();
  expect(methods).toEqual(["HEAD", "GET"]);
});

it("fails closed when a HEAD 404 probe is denied", async () => {
  handler = (request, response) =>
    fail(
      response,
      request.method === "HEAD" ? 404 : 403,
      request.method === "HEAD" ? "NotFound" : "AccessDenied",
    );
  await expect(storage.stat(locator)).rejects.toMatchObject({
    code: "ACCESS_DENIED",
  });
});
it("rejects a server that ignores requested ranges", async () => {
  handler = (_request, response) => {
    response
      .writeHead(200, {
        "content-type": "image/png",
        "content-length": bytes.length,
      })
      .end(bytes);
  };
  await expect(
    storage.get(locator, { range: { start: 1, end: 2 } }),
  ).rejects.toMatchObject({ code: "UNAVAILABLE" });
});
it("rejects inconsistent returned range metadata", async () => {
  handler = (_request, response) => {
    response
      .writeHead(206, {
        "content-type": "image/png",
        "content-length": 2,
        "content-range": "bytes 0-1/10",
      })
      .end("xx");
  };
  await expect(
    storage.get(locator, { range: { start: 1, end: 2 } }),
  ).rejects.toMatchObject({ code: "UNAVAILABLE" });
});
it("keeps the deadline active after headers while a response body stalls", async () => {
  storage.close();
  storage = createS3ObjectStorage(config, { operationTimeoutMs: 200 });
  handler = (_request, response) => {
    response.writeHead(200, {
      "content-type": "image/png",
      "content-length": bytes.length,
    });
    response.flushHeaders();
    response.write(bytes.subarray(0, 1));
  };
  const object = await storage.get(locator);
  await expect(consume(object.body)).rejects.toMatchObject({
    code: "UNAVAILABLE",
  });
});
it("cancels an in-flight download and destroys its upstream connection", async () => {
  let closed = false;
  handler = (_request, response) => {
    response.on("close", () => {
      closed = true;
    });
    response.writeHead(200, {
      "content-type": "image/png",
      "content-length": bytes.length,
    });
    response.flushHeaders();
  };
  const controller = new AbortController();
  const object = await storage.get(locator, { signal: controller.signal });
  controller.abort("private-reason");
  await expect(consume(object.body)).rejects.toMatchObject({
    code: "ABORTED",
    message: "Storage operation was cancelled.",
  });
  for (let i = 0; !closed && i < 100; i++) await delay(5);
  expect(closed).toBe(true);
});
it("releases an unread upstream when the caller destroys its stream", async () => {
  let closed = false;
  handler = (_request, response) => {
    response.on("close", () => {
      closed = true;
    });
    response.writeHead(200, {
      "content-type": "image/png",
      "content-length": bytes.length,
    });
    response.flushHeaders();
  };
  const object = await storage.get(locator);
  object.body.destroy();
  for (let i = 0; !closed && i < 100; i++) await delay(5);
  expect(closed).toBe(true);
});
it("normalizes a truncated response without appending an error payload", async () => {
  handler = (_request, response) => {
    response.writeHead(200, {
      "content-type": "image/png",
      "content-length": bytes.length,
    });
    response.flushHeaders();
    response.write("x");
    setImmediate(() => response.destroy());
  };
  const object = await storage.get(locator);
  await expect(consume(object.body)).rejects.toMatchObject({
    code: "UNAVAILABLE",
  });
});
it("bounds stalled requests before headers and does not retry past the deadline", async () => {
  storage.close();
  storage = createS3ObjectStorage(config, { operationTimeoutMs: 150 });
  handler = () => {};
  await expect(storage.stat(locator)).rejects.toMatchObject({
    code: "UNAVAILABLE",
  });
  expect(requests).toBe(1);
});

it("cancels a stalled upload source at the operation deadline", async () => {
  storage.close();
  storage = createS3ObjectStorage(config, { operationTimeoutMs: 200 });
  handler = () => {};
  const source = new Readable({ read() {} });
  source.push(bytes.subarray(0, 1));
  await expect(
    storage.put({
      locator,
      contentType: "image/png",
      sizeBytes: bytes.length,
      metadata,
      openBody: () => source,
    }),
  ).rejects.toMatchObject({ code: "UNAVAILABLE" });
  expect(source.destroyed).toBe(true);
});
