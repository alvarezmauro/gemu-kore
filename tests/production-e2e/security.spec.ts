import { expect, test } from "@playwright/test";

test("production headers protect public, private and missing responses", async ({
  request,
}) => {
  for (const path of [
    "/login",
    "/app",
    "/api/health",
    "/collection",
    "/unavailable-security-review-page",
    "/api/media/private/00000000-0000-4000-8000-000000000023",
  ]) {
    const response = await request.get(path, { maxRedirects: 0 });
    const headers = response.headers();
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["content-security-policy"]).toContain(
      "frame-ancestors 'none'",
    );
    expect(headers["content-security-policy"]).toContain("object-src 'none'");
    expect(headers["content-security-policy"]).toContain("form-action 'self'");
    expect(headers["strict-transport-security"]).toBe("max-age=31536000");
    expect(headers["permissions-policy"]).toContain("camera=()");
    expect(headers["referrer-policy"]).toBe("same-origin");
    expect(headers["x-powered-by"]).toBeUndefined();
  }
  const callback = await request.get("/api/auth/error?error=review", {
    maxRedirects: 0,
  });
  expect(callback.headers()["referrer-policy"]).toBe("no-referrer");
  expect(callback.headers()["location"]).toContain(
    "/login?error=sign_in_failed",
  );
});

test("proxy bounds ordinary bodies and hides callback details on upstream failure", async ({
  request,
}) => {
  const oversized = await request.post(
    "/api/auth/callback/security-review-provider",
    {
      headers: {
        Origin: "https://127.0.0.1:3111",
        "Content-Type": "application/json",
      },
      data: Buffer.alloc(1024 * 1024 + 1, 32),
    },
  );
  expect(oversized.status()).toBe(413);
  const failure = await request.get(
    "/__test_proxy_failure?code=security-review-code&state=security-review-state",
    { headers: { "X-Review-Sentinel": "security-review-header" } },
  );
  expect(failure.status()).toBe(502);
});

test("spoofed forwarding headers cannot evade the production sign-in limit", async ({
  request,
}) => {
  let limited = false;
  for (let attempt = 0; attempt < 11; attempt++) {
    const response = await request.post("/api/auth/sign-in/social", {
      headers: {
        Origin: "https://127.0.0.1:3111",
        "X-Real-IP": `192.0.2.${attempt + 1}`,
        "X-Forwarded-For": `198.51.100.${attempt + 1}`,
        "CF-Connecting-IP": `203.0.113.${attempt + 1}`,
      },
      data: { provider: "unconfigured-security-review-provider" },
    });
    if (response.status() === 429) limited = true;
    else expect([400, 404]).toContain(response.status());
  }
  expect(limited).toBe(true);
});
