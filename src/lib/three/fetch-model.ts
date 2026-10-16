import {
  ModelError,
  modelLimits,
  modelPresentation,
  type ModelPresentation,
} from "./contracts";
export async function fetchModel(
  presentation: ModelPresentation,
  signal: AbortSignal,
  progress: (received: number, total: number) => void,
) {
  const parsed = modelPresentation.safeParse(presentation);
  if (!parsed.success || presentation.resource.byteLength > modelLimits.bytes)
    throw new ModelError();
  const requestSignal = AbortSignal.any([signal, AbortSignal.timeout(60_000)]);
  const response = await fetch(presentation.resource.url, {
    credentials: "same-origin",
    cache: "no-store",
    redirect: "error",
    signal: requestSignal,
  });
  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    throw new ModelError(
      [401, 403].includes(response.status)
        ? "Your access changed. Sign in again before viewing this model."
        : "This model could not be loaded. Refresh or try again.",
    );
  }
  if (
    response.headers.get("content-type")?.split(";")[0].trim() !==
      "model/gltf-binary" ||
    response.headers.get("content-length") !==
      String(presentation.resource.byteLength) ||
    !response.body
  ) {
    await response.body?.cancel().catch(() => {});
    throw new ModelError();
  }
  const reader = response.body.getReader(),
    chunks: Uint8Array[] = [];
  let size = 0,
    complete = false;
  try {
    while (true) {
      const next = await reader.read();
      requestSignal.throwIfAborted();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > modelLimits.bytes || size > presentation.resource.byteLength)
        throw new ModelError();
      chunks.push(next.value);
      progress(size, presentation.resource.byteLength);
    }
    if (size !== presentation.resource.byteLength) throw new ModelError();
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    complete = true;
    return bytes.buffer;
  } finally {
    if (!complete) await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
