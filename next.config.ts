import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Preserve the repository's maintained agent instructions.
  agentRules: false,
  serverExternalPackages: ["gltf-validator"],
};

export default nextConfig;
