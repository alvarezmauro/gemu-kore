declare module "gltf-validator" {
  export function validateBytes(
    bytes: Uint8Array,
    options: {
      format: "glb";
      maxIssues: number;
      writeTimestamp: boolean;
      externalResourceFunction: (uri: string) => Promise<Uint8Array>;
    },
  ): Promise<{ issues: { numErrors: number; truncated: boolean } }>;
}
