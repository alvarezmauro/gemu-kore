import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Docker image packages the traced server; ordinary local builds retain
  // the existing pnpm start workflow.
  output: process.env.GEMUKORE_STANDALONE === "1" ? "standalone" : undefined,
  // Preserve the repository's maintained agent instructions.
  agentRules: false,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "same-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=()",
          },
          {
            key: "Content-Security-Policy",
            value:
              "object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
          },
        ],
      },
      {
        // Next applies configured headers at the framework boundary too; keep
        // OAuth callback URLs out of same-origin referrers as well.
        source: "/api/auth/:path*",
        headers: [{ key: "Referrer-Policy", value: "no-referrer" }],
      },
    ];
  },
  // Revocable contextual media must never enter the optimizer's shared cache,
  // including direct requests that bypass our unoptimized Image components.
  images: { localPatterns: [{ pathname: "/brand/**", search: "" }] },
  // Policy-dependent metadata must resolve in the head before content streams.
  htmlLimitedBots: /.*/,
  serverExternalPackages: ["gltf-validator"],
};

export default nextConfig;
