import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { AssetError } from "./contracts";
import { uploadDescription } from "./processing";

function invalid(mime: string | null, filename: string | null) {
  try {
    uploadDescription(mime, filename);
    throw new Error("Expected invalid upload description");
  } catch (error) {
    expect(error).toBeInstanceOf(AssetError);
    expect(error).toMatchObject({ code: "INVALID_INPUT" });
  }
}
describe("upload MIME and filename validation", () => {
  it.each([
    ["image/jpeg", "front.jpg", "IMAGE"],
    ["image/jpeg", "front.JPEG", "IMAGE"],
    ["image/png", "box.PNG", "IMAGE"],
    ["image/webp", "logo.webp", "IMAGE"],
    ["image/avif", "cover.avif", "IMAGE"],
    ["model/gltf-binary", "console.GLB", "MODEL_3D"],
  ])(
    "accepts declared %s only with its matching filename %s",
    (mime, filename, kind) => {
      expect(uploadDescription(mime, encodeURIComponent(filename))).toEqual({
        mimeType: mime,
        filename,
        kind,
      });
    },
  );
  it.each([
    null,
    "",
    "IMAGE/JPEG",
    "image/jpg",
    "image/jpeg; charset=utf-8",
    " image/png",
    "image/png ",
    "image/jpeg\n",
    "image/svg+xml",
    "text/html",
    "image/gif",
    "image/heic",
    "application/octet-stream",
    "model/gltf+json",
    "video/mp4",
    "constructor",
    "toString",
    "__proto__",
  ])("rejects unsupported MIME %j with a domain error", (mime) =>
    invalid(mime, "private-name.jpg"),
  );
  it.each([
    "photo.png",
    "photo.jpeg.exe",
    "photo",
    "photo.",
    "photo.jpg ",
    "photo.jpg?download=1",
    "photo.jpg#fragment",
    "photo.glb",
    "photo.svg",
    "photo.html",
  ])("rejects the mismatched JPEG extension %j", (filename) =>
    invalid("image/jpeg", encodeURIComponent(filename)),
  );
  it.each([
    null,
    "",
    "%",
    "%GG",
    "%E0%A4%A",
    "%FF",
    "folder%2F",
    "C%3A%5Cfolder%5C",
    "photo%00.jpg",
    "photo%0D%0Aheader.jpg",
    "photo%09.jpg",
    "photo%7F.jpg",
  ])("rejects missing, malformed or control-containing names %j", (filename) =>
    invalid("image/jpeg", filename),
  );
  it.each([
    ["/Users/collector/private/front.jpg", "front.jpg"],
    ["C:\\Users\\collector\\front.JPG", "front.JPG"],
    ["folder\\nested/front.jpg", "front.jpg"],
    ["../front.jpg", "front.jpg"],
    ["ファミコン 写真.jpg", "ファミコン 写真.jpg"],
    ["Cafe\u0301.jpg", "Café.jpg"],
    ["photo+box #1.jpg", "photo+box #1.jpg"],
    ["100% complete.jpg", "100% complete.jpg"],
    ["folder%2Ffront.jpg", "folder%2Ffront.jpg"],
  ])(
    "normalizes private filename %j to %j without a second URL decode",
    (source, expected) => {
      const result = uploadDescription(
        "image/jpeg",
        encodeURIComponent(source),
      );
      expect(result.filename).toBe(expected);
      expect(
        uploadDescription(result.mimeType, encodeURIComponent(result.filename)),
      ).toEqual(result);
    },
  );
  it("accepts the basename limit and rejects the next code unit", () => {
    const name = "a".repeat(251) + ".jpg";
    expect(name).toHaveLength(255);
    expect(uploadDescription("image/jpeg", name).filename).toBe(name);
    invalid("image/jpeg", "a" + name);
  });
  it("bounds the encoded header independently of its final basename", () => {
    const header = "a".repeat(1490) + "/photo.jpg";
    expect(header).toHaveLength(1500);
    expect(uploadDescription("image/jpeg", header).filename).toBe("photo.jpg");
    invalid("image/jpeg", "a" + header);
  });
  it("keeps rejection details free of original filenames", () => {
    expect.assertions(2);
    try {
      uploadDescription("text/html", "private-owner-secret.html");
    } catch (error) {
      expect(error).toBeInstanceOf(AssetError);
      expect(String(error)).not.toContain("private-owner-secret");
    }
  });
});
