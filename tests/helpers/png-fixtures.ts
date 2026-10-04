import { deflateSync } from "node:zlib";

// PNG fixture chunks have valid CRCs so decoder failures cannot accidentally
// stand in for animation/pixel-budget checks. No production parser is mocked.
export function pngChunk(type: string, data: Buffer) {
  const payload = Buffer.concat([Buffer.from(type, "ascii"), data]);
  let crc = 0xffffffff;
  for (const byte of payload) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++)
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  const result = Buffer.alloc(12 + data.length);
  result.writeUInt32BE(data.length);
  payload.copy(result, 4);
  result.writeUInt32BE((crc ^ 0xffffffff) >>> 0, 8 + data.length);
  return result;
}

export function monochromePng(width: number, height: number) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 1; // One-bit grayscale; compact fixture even above 64 million pixels.
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", ihdr),
    pngChunk(
      "IDAT",
      deflateSync(Buffer.alloc((1 + Math.ceil(width / 8)) * height)),
    ),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}
