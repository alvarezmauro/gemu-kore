import { setTimeout as pause } from "node:timers/promises";

const hosts = ["garage1", "garage2", "garage3"];
const token = process.env.GARAGE_ADMIN_TOKEN;
const bucketName = process.env.S3_BUCKET;
let keyId = process.env.S3_ACCESS_KEY_ID;
let secret = process.env.S3_SECRET_ACCESS_KEY;
const provision = process.argv.includes("--provision");
const pending = "PROVISION_WITH_GARAGE";
const capacity = Number(process.env.GARAGE_NODE_CAPACITY);
let phase = "configuration";

async function api(host, operation, { body, params, missing = false } = {}) {
  const url = new URL(`/v2/${operation}`, `http://${host}:3903`);
  for (const [key, value] of Object.entries(params ?? {}))
    url.searchParams.set(key, value);
  const response = await fetch(url, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(5000),
  });
  if (missing && response.status === 404) return null;
  if (!response.ok) throw new Error("Storage administration request failed.");
  return response.json();
}

async function setup() {
  if (
    !token ||
    !bucketName ||
    !keyId ||
    !secret ||
    !Number.isSafeInteger(capacity) ||
    capacity <= 0
  )
    throw new Error("Missing storage configuration.");
  phase = "node discovery";
  const nodes = [];
  for (const host of hosts) {
    const info = await api(host, "GetNodeInfo", { params: { node: "self" } });
    const ids = Object.keys(info.success);
    if (ids.length !== 1 || !/^[a-f0-9]{64}$/.test(ids[0]))
      throw new Error("Unexpected node identity.");
    nodes.push({ id: ids[0], host });
  }
  const connected = await api(hosts[0], "ConnectClusterNodes", {
    body: nodes.slice(1).map((node) => `${node.id}@${node.host}:3901`),
  });
  if (!connected.every((result) => result.success))
    throw new Error("Storage peers are unavailable.");
  const deadline = Date.now() + 90000;
  while (true) {
    const status = await api(hosts[0], "GetClusterStatus");
    if (status.nodes.filter((node) => node.isUp).length === 3) break;
    if (Date.now() > deadline)
      throw new Error("Storage peer deadline exceeded.");
    await pause(500);
  }
  phase = "cluster layout";
  const layout = await api(hosts[0], "GetClusterLayout");
  if (layout.version === 0) {
    if (layout.stagedRoleChanges.length)
      throw new Error("Review staged layout changes first.");
    await api(hosts[0], "UpdateClusterLayout", {
      body: {
        roles: nodes.map((node) => ({
          id: node.id,
          capacity,
          zone: "docker-host",
          tags: [],
        })),
      },
    });
    await api(hosts[0], "ApplyClusterLayout", { body: { version: 1 } });
  } else if (
    layout.roles.length !== 3 ||
    !layout.roles.every((role) => nodes.some((node) => node.id === role.id))
  ) {
    // Never rebalance or replace an existing cluster merely because a container
    // or volume disappeared. Recovery requires an explicit operator decision.
    throw new Error("Existing storage layout requires operator review.");
  }
  while (true) {
    const health = await api(hosts[0], "GetClusterHealth");
    if (
      health.status === "healthy" &&
      health.storageNodes === 3 &&
      health.storageNodesUp === 3
    )
      break;
    if (Date.now() > deadline)
      throw new Error("Storage quorum deadline exceeded.");
    await pause(500);
  }
  phase = "private bucket";
  let bucket = await api(hosts[0], "GetBucketInfo", {
    params: { globalAlias: bucketName },
    missing: true,
  });
  if (!bucket)
    bucket = await api(hosts[0], "CreateBucket", {
      body: { globalAlias: bucketName },
    });
  if (bucket.websiteAccess)
    throw new Error("The application bucket must be private.");
  phase = "application key";
  if (provision && keyId === pending && secret === pending) {
    // Let Garage allocate the identifier; ImportKey is reserved for restores.
    const created = await api(hosts[0], "CreateKey", {
      body: { name: "GemuKore application" },
    });
    keyId = created.accessKeyId;
    const generated = await api(hosts[0], "GetKeyInfo", {
      params: { id: keyId, showSecretKey: "true" },
    });
    secret = generated.secretAccessKey;
  }
  const key = await api(hosts[0], "GetKeyInfo", {
    params: { id: keyId, showSecretKey: "true" },
    missing: true,
  });
  if (
    !key ||
    key.secretAccessKey !== secret ||
    key.expired ||
    key.permissions.createBucket ||
    key.buckets.some(
      (entry) => entry.id !== bucket.id || entry.permissions.owner,
    )
  )
    throw new Error("Existing storage credentials require operator review.");
  await api(hosts[0], "AllowBucketKey", {
    body: {
      bucketId: bucket.id,
      accessKeyId: keyId,
      permissions: { read: true, write: true, owner: false },
    },
  });
  if (provision) {
    // Captured by the host provisioning helper, never forwarded to its stdout.
    console.info(
      JSON.stringify({ accessKeyId: keyId, secretAccessKey: secret }),
    );
  } else {
    console.info(
      "Private object storage is ready; the existing layout and credentials were preserved.",
    );
  }
}

try {
  await setup();
} catch {
  // Never print provider bodies, credentials, bearer tokens or request objects.
  console.error(
    `Storage setup failed during ${phase}. Check configuration and the private cluster status.`,
  );
  process.exitCode = 1;
}
