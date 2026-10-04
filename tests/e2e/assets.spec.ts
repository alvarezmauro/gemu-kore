import { expect, test } from "@playwright/test";
test("anonymous media requests remain private on desktop and mobile", async ({
  request,
}) => {
  const id = "11111111-1111-4111-8111-111111111111";
  const requests = [
    await request.post("/api/uploads", {
      headers: { "content-type": "image/png", "x-file-name": "private.png" },
      data: "not an image",
    }),
    await request.post(`/api/uploads/${id}/complete`),
    await request.get(`/api/media/private/${id}`, {
      headers: { "if-none-match": '"private"' },
    }),
    await request.head(`/api/media/private/${id}`),
  ];
  for (const response of requests) {
    expect(response.status()).toBe(401);
    expect(response.headers()["cache-control"]).toContain("no-store");
    expect(response.headers()["x-content-type-options"]).toBe("nosniff");
    expect(response.headers()["location"]).toBeUndefined();
  }
});
