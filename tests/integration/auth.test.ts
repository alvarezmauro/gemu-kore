import { generateKeyPairSync, randomUUID, sign } from "node:crypto";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { createAuth } from "@/server/auth/config";
import { getAuthenticatedIdentity } from "@/server/auth/session";
import { GET, POST } from "@/app/api/auth/[...all]/route";
import { disconnectDatabase, getDatabase } from "@/server/db/client";

const baseURL = "http://localhost:3002";
const credentials = {
  clientId: "test-client",
  clientSecret: "test-client-secret",
};
const auth = createAuth(getDatabase(), {
  baseURL,
  secret: "integration-only-secret-longer-than-thirty-two-characters",
  production: false,
  google: credentials,
  github: credentials,
});
const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = {
  ...keys.publicKey.export({ format: "jwk" }),
  alg: "RS256",
  kid: "integration-key",
  use: "sig",
};
let subject: string;
let email: string | null;
let verified: boolean;
let githubProfileEmail: string | null;
let googleClaims: Record<string, unknown>;
let tokenExchangeFails: boolean;
let invalidGoogleSignature: boolean;

function googleToken() {
  const now = Math.floor(Date.now() / 1000);
  const head = Buffer.from(
    JSON.stringify({ alg: "RS256", kid: jwk.kid }),
  ).toString("base64url");
  const claims = Buffer.from(
    JSON.stringify({
      iss: "https://accounts.google.com",
      aud: credentials.clientId,
      iat: now,
      exp: now + 3600,
      sub: subject,
      name: "Test collector",
      email,
      email_verified: verified,
      ...googleClaims,
    }),
  ).toString("base64url");
  const body = `${head}.${claims}`;
  const signature = sign(
    "RSA-SHA256",
    Buffer.from(body),
    keys.privateKey,
  ).toString("base64url");
  return `${body}.${invalidGoogleSignature ? (signature[0] === "A" ? "B" : "A") + signature.slice(1) : signature}`;
}

function cookies(response: Response) {
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";", 1)[0])
    .join("; ");
}

async function start(
  provider: "github" | "google",
  instance = auth,
  origin = baseURL,
) {
  const response = await instance.handler(
    new Request(`${origin}/api/auth/sign-in/social`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: origin },
      body: JSON.stringify({
        provider,
        callbackURL: "/app",
        errorCallbackURL: "/login",
      }),
    }),
  );
  expect(response.status).toBe(200);
  const data = await response.json();
  const state = new URL(data.url).searchParams.get("state");
  expect(state).toBeTruthy();
  return {
    state,
    cookie: cookies(response),
    authorizationURL: new URL(data.url),
  };
}

async function login(
  provider: "github" | "google",
  instance = auth,
  origin = baseURL,
) {
  const { state, cookie } = await start(provider, instance, origin);
  return instance.handler(
    new Request(
      `${origin}/api/auth/callback/${provider}?state=${state}&code=test-code`,
      { headers: { Cookie: cookie } },
    ),
  );
}

beforeEach(async () => {
  vi.stubEnv("BETTER_AUTH_URL", baseURL);
  vi.stubEnv(
    "BETTER_AUTH_SECRET",
    "integration-only-secret-longer-than-thirty-two-characters",
  );
  vi.stubEnv("GOOGLE_CLIENT_ID", credentials.clientId);
  vi.stubEnv("GOOGLE_CLIENT_SECRET", credentials.clientSecret);
  vi.stubEnv("GITHUB_CLIENT_ID", credentials.clientId);
  vi.stubEnv("GITHUB_CLIENT_SECRET", credentials.clientSecret);
  await getDatabase().user.deleteMany();
  await getDatabase().verification.deleteMany();
  subject = String(Math.floor(Math.random() * 1000000000) + 1);
  email = `collector-${randomUUID()}@example.com`;
  verified = true;
  githubProfileEmail = null;
  googleClaims = {};
  tokenExchangeFails = false;
  invalidGoogleSignature = false;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request) => {
      const url = String(input instanceof Request ? input.url : input);
      if (
        url === "https://github.com/login/oauth/access_token" ||
        url === "https://oauth2.googleapis.com/token"
      ) {
        if (tokenExchangeFails)
          return Response.json({ error: "invalid_grant" }, { status: 400 });
        return Response.json({
          access_token: "test-access-token",
          refresh_token: "test-refresh-token",
          token_type: "bearer",
          expires_in: 3600,
          scope: "read:user,user:email",
          ...(url.includes("googleapis") ? { id_token: googleToken() } : {}),
        });
      }
      if (url === "https://api.github.com/user")
        return Response.json({
          id: Number(subject),
          login: "test-collector",
          name: "Test collector",
          email: githubProfileEmail,
        });
      if (url === "https://api.github.com/user/emails")
        return Response.json(email ? [{ email, primary: true, verified }] : []);
      if (url === "https://www.googleapis.com/oauth2/v3/certs")
        return Response.json({ keys: [jwk] });
      throw new Error("Unexpected provider network request in auth test.");
    }),
  );
});

afterEach(() => vi.unstubAllGlobals());
afterAll(async () => {
  await getDatabase().user.deleteMany();
  await getDatabase().verification.deleteMany();
  await disconnectDatabase();
  vi.unstubAllEnvs();
});

describe("real Better Auth callback with isolated PostgreSQL and mocked providers", () => {
  it.each(["google", "github"] as const)(
    "creates a verified %s identity, encrypted credentials and a fixed session",
    async (provider) => {
      email = ` Collector+${randomUUID()}@EXAMPLE.com `;
      const response = await login(provider);
      expect(response.headers.get("location")).toBe("/app");
      const account = await getDatabase().account.findUniqueOrThrow({
        where: {
          providerId_accountId: { providerId: provider, accountId: subject },
        },
        include: { user: true },
      });
      expect(account.user.email).toBe(email.trim().toLowerCase());
      expect(account.user.emailVerified).toBe(true);
      expect(account.user.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(account.accessToken).not.toBe("test-access-token");
      expect(account.refreshToken).not.toBe("test-refresh-token");
      const session = await getDatabase().session.findFirstOrThrow();
      expect(session.expiresAt.getTime() - session.createdAt.getTime()).toBe(
        7 * 24 * 60 * 60 * 1000,
      );
      const identity = await auth.api.getSession({
        headers: new Headers({ Cookie: cookies(response) }),
        query: { disableCookieCache: true, disableRefresh: true },
      });
      expect(identity?.user.id).toBe(account.user.id);
      expect(
        await getAuthenticatedIdentity(
          new Headers({ Cookie: cookies(response) }),
        ),
      ).toEqual({
        userId: account.user.id,
        sessionId: session.id,
        email: account.user.email,
      });
      expect(
        response.headers
          .getSetCookie()
          .some(
            (cookie) =>
              cookie.includes("HttpOnly") && cookie.includes("SameSite=Lax"),
          ),
      ).toBe(true);
      expect(
        response.headers
          .getSetCookie()
          .some((cookie) => cookie.includes("session_data")),
      ).toBe(false);
    },
  );

  it.each(["google", "github"] as const)(
    "rejects unverified and missing %s email before provisioning",
    async (provider) => {
      verified = false;
      expect((await login(provider)).headers.get("location")).toContain(
        "/login?error=",
      );
      verified = true;
      email = null;
      expect((await login(provider)).headers.get("location")).toContain(
        "/login?error=",
      );
      expect(await getDatabase().user.count()).toBe(0);
      expect(await getDatabase().session.count()).toBe(0);
    },
  );

  it("does not verify an unverified GitHub profile email using another verified address", async () => {
    githubProfileEmail = "unverified@example.com";
    const response = await login("github");
    expect(response.headers.get("location")).toContain("/login?error=");
    expect(await getDatabase().user.count()).toBe(0);
  });

  it.each(["google", "github"] as const)(
    "allows returning %s login without creating another user",
    async (provider) => {
      await login(provider);
      expect((await login(provider)).headers.get("location")).toBe("/app");
      expect(await getDatabase().user.count()).toBe(1);
      expect(await getDatabase().account.count()).toBe(1);
      expect(await getDatabase().session.count()).toBe(2);
    },
  );

  it.each(["google", "github"] as const)(
    "rejects a changed %s email and revokes previous sessions",
    async (provider) => {
      const response = await login(provider);
      const original = await getDatabase().user.findFirstOrThrow();
      email = "changed@example.com";
      expect((await login(provider)).headers.get("location")).toContain(
        "/login?error=",
      );
      expect((await getDatabase().user.findFirstOrThrow()).email).toBe(
        original.email,
      );
      expect(await getDatabase().session.count()).toBe(0);
      expect(
        await auth.api.getSession({
          headers: new Headers({ Cookie: cookies(response) }),
        }),
      ).toBeNull();
    },
  );

  it.each(["google", "github"] as const)(
    "rejects returning %s identity when verification is lost",
    async (provider) => {
      await login(provider);
      verified = false;
      expect((await login(provider)).headers.get("location")).toContain(
        "/login?error=",
      );
      expect(await getDatabase().session.count()).toBe(0);
    },
  );

  it("never implicitly links a second provider with the same email", async () => {
    await login("google");
    expect((await login("github")).headers.get("location")).toContain(
      "error=account_not_linked",
    );
    expect(await getDatabase().user.count()).toBe(1);
    expect(await getDatabase().account.count()).toBe(1);
  });

  it.each([
    { aud: "wrong-client" },
    { iss: "https://untrusted.example" },
    { exp: 1 },
  ])("rejects a signed Google token with invalid claims", async (claims) => {
    googleClaims = claims;
    expect((await login("google")).headers.get("location")).toContain(
      "/login?error=",
    );
    expect(await getDatabase().session.count()).toBe(0);
  });

  it("rejects callback state replay and missing state", async () => {
    const { state, cookie } = await start("github");
    const request = () =>
      new Request(
        `${baseURL}/api/auth/callback/github?state=${state}&code=test-code`,
        { headers: { Cookie: cookie } },
      );
    expect((await auth.handler(request())).headers.get("location")).toBe(
      "/app",
    );
    expect((await auth.handler(request())).headers.get("location")).toContain(
      "error=",
    );
    expect(
      (
        await auth.handler(
          new Request(`${baseURL}/api/auth/callback/github?code=test-code`),
        )
      ).headers.get("location"),
    ).toContain("error=state_not_found");
    expect(await getDatabase().session.count()).toBe(1);
  });

  it("rejects provider exchange failures", async () => {
    tokenExchangeFails = true;
    expect((await login("github")).headers.get("location")).toContain(
      "error=invalid_code",
    );
    expect(await getDatabase().session.count()).toBe(0);
  });

  it("rejects a Google token with a forged signature", async () => {
    invalidGoogleSignature = true;
    expect((await login("google")).headers.get("location")).toContain(
      "/login?error=",
    );
    expect(await getDatabase().user.count()).toBe(0);
    expect(await getDatabase().session.count()).toBe(0);
  });

  it("uses secure host-only cookies in production", async () => {
    const origin = "https://collection.example";
    const production = createAuth(getDatabase(), {
      baseURL: origin,
      secret: "production-test-only-secret-not-for-real-use",
      production: true,
      github: credentials,
    });
    const response = await login("github", production, origin);
    expect(response.headers.get("location")).toBe("/app");
    const sessionCookie = response.headers
      .getSetCookie()
      .find((cookie) => cookie.includes("session_token="));
    expect(sessionCookie).toContain("Secure");
    expect(sessionCookie).toContain("HttpOnly");
    expect(sessionCookie).toContain("SameSite=Lax");
    expect(sessionCookie).not.toContain("Domain=");
  });

  it("rejects an untrusted request origin and external return URL", async () => {
    for (const [origin, callbackURL] of [
      ["https://untrusted.example", "/app"],
      [baseURL, "https://untrusted.example/app"],
    ]) {
      const response = await auth.handler(
        new Request(`${baseURL}/api/auth/sign-in/social`, {
          method: "POST",
          headers: { Origin: origin, "Content-Type": "application/json" },
          body: JSON.stringify({ provider: "github", callbackURL }),
        }),
      );
      expect(response.status).toBe(403);
    }
  });

  it("rejects a callback without the browser state cookie", async () => {
    const { state } = await start("github");
    const response = await auth.handler(
      new Request(
        `${baseURL}/api/auth/callback/github?state=${state}&code=test-code`,
      ),
    );
    expect(response.headers.get("location")).toContain("error=");
    expect(await getDatabase().session.count()).toBe(0);
  });

  it("blocks the alternate client ID-token login path", async () => {
    const response = await auth.handler(
      new Request(`${baseURL}/api/auth/sign-in/social`, {
        method: "POST",
        headers: { Origin: baseURL, "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "google",
          idToken: { token: googleToken() },
        }),
      }),
    );
    expect(response.status).toBe(404);
    expect(await getDatabase().session.count()).toBe(0);
  });

  it("does not return a trusted identity for a locally unverified user", async () => {
    const response = await login("github");
    await getDatabase().user.updateMany({ data: { emailVerified: false } });
    expect(
      await getAuthenticatedIdentity(
        new Headers({ Cookie: cookies(response) }),
      ),
    ).toBeNull();
  });

  it("blocks direct linking, credential, identity edit and token exposure endpoints", async () => {
    for (const path of [
      "/link-social",
      "/unlink-account",
      "/change-email",
      "/update-user",
      "/delete-user",
      "/sign-up/email",
      "/sign-in/email",
      "/get-access-token",
      "/refresh-token",
      "/get-session",
      "/list-sessions",
      "/account-info",
    ]) {
      const response = await auth.handler(
        new Request(`${baseURL}/api/auth${path}`, {
          method: "POST",
          headers: { Origin: baseURL, "Content-Type": "application/json" },
          body: "{}",
        }),
      );
      expect(response.status, path).toBe(404);
    }
    expect(
      (await auth.handler(new Request(`${baseURL}/api/auth/get-session`)))
        .status,
    ).toBe(404);
  });

  it("rejects expired database sessions without sliding renewal", async () => {
    const response = await login("github");
    const session = await getDatabase().session.findFirstOrThrow();
    const headers = new Headers({ Cookie: cookies(response) });
    await getDatabase().session.update({
      where: { id: session.id },
      data: {
        createdAt: new Date(Date.now() - 3 * 86400000),
        updatedAt: new Date(Date.now() - 3 * 86400000),
      },
    });
    await auth.api.getSession({ headers });
    expect((await getDatabase().session.findFirstOrThrow()).expiresAt).toEqual(
      session.expiresAt,
    );
    await getDatabase().session.update({
      where: { id: session.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect(await auth.api.getSession({ headers })).toBeNull();
  });

  it("signs out and immediately invalidates the old session cookie", async () => {
    const response = await login("github");
    const headers = new Headers({
      Cookie: cookies(response),
      Origin: baseURL,
      "Content-Type": "application/json",
    });
    const logout = await auth.handler(
      new Request(`${baseURL}/api/auth/sign-out`, {
        method: "POST",
        headers,
        body: "{}",
      }),
    );
    expect(logout.status).toBe(200);
    expect(await getDatabase().session.count()).toBe(0);
    expect(await auth.api.getSession({ headers })).toBeNull();
  });

  it("runs configured login and callback through the application's Next.js handler with no-store responses", async () => {
    const startResponse = await POST(
      new Request(`${baseURL}/api/auth/sign-in/social`, {
        method: "POST",
        headers: { Origin: baseURL, "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "github",
          callbackURL: "/app",
          errorCallbackURL: "/login",
        }),
      }),
    );
    expect(startResponse.status).toBe(200);
    expect(startResponse.headers.get("cache-control")).toBe(
      "private, no-store",
    );
    const { url } = await startResponse.json();
    const state = new URL(url).searchParams.get("state");
    const response = await GET(
      new Request(
        `${baseURL}/api/auth/callback/github?state=${state}&code=test-code`,
        { headers: { Cookie: cookies(startResponse) } },
      ),
    );
    expect(response.headers.get("location")).toBe("/app");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(
      await getAuthenticatedIdentity(
        new Headers({ Cookie: cookies(response) }),
      ),
    ).not.toBeNull();
  });
});
