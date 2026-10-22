import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Preserve the repository's maintained agent instructions.
  agentRules: false,
  // Revocable contextual media must never enter the optimizer's shared cache,
  // including direct requests that bypass our unoptimized Image components.
  images: { localPatterns: [{ pathname: "/brand/**", search: "" }] },
  serverExternalPackages: ["gltf-validator"],
};

export default nextConfig;
