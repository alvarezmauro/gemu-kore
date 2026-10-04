import { z } from "zod";

const optionalValue = (schema: z.ZodString) =>
  z.preprocess(
    (value) => (value === "" ? undefined : value),
    schema.optional(),
  );

const storageFields = [
  "S3_ENDPOINT",
  "S3_REGION",
  "S3_BUCKET",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
] as const;

export const storageEnvironmentSchema = z
  .object({
    NODE_ENV: z.enum(["development", "production", "test"]),
    S3_ENDPOINT: optionalValue(z.string().url()),
    S3_REGION: optionalValue(
      z
        .string()
        .regex(/^[a-z0-9-]+$/)
        .max(64)
        .refine((value) => !/\s/.test(value)),
    ),
    S3_BUCKET: optionalValue(
      z
        .string()
        .min(3)
        .max(63)
        .regex(/^[a-z0-9][a-z0-9.-]*[a-z0-9]$/)
        .refine(
          (value) =>
            value === value.trim() &&
            !value.includes("..") &&
            !/^\d+\.\d+\.\d+\.\d+$/.test(value),
        ),
    ),
    S3_ACCESS_KEY_ID: optionalValue(
      z
        .string()
        .min(1)
        .max(256)
        .regex(/^[^\s]+$/),
    ),
    S3_SECRET_ACCESS_KEY: optionalValue(
      z
        .string()
        .min(1)
        .max(1024)
        .regex(/^[^\r\n]+$/)
        .refine((value) => value.trim().length > 0),
    ),
    S3_FORCE_PATH_STYLE: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z
        .enum(["true", "false"])
        .default("true")
        .transform((value) => value === "true"),
    ),
  })
  .superRefine((env, context) => {
    if (storageFields.some((field) => env[field] !== undefined)) {
      for (const field of storageFields) {
        if (!env[field])
          context.addIssue({
            code: "custom",
            path: [field],
            message: "Configure all storage fields together.",
          });
      }
    }
    if (env.S3_ENDPOINT && URL.canParse(env.S3_ENDPOINT)) {
      const url = new URL(env.S3_ENDPOINT);
      if (
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        url.pathname !== "/" ||
        (url.protocol !== "https:" &&
          !(
            url.protocol === "http:" &&
            env.NODE_ENV !== "production" &&
            ["localhost", "127.0.0.1", "[::1]", "minio"].includes(url.hostname)
          ))
      ) {
        context.addIssue({
          code: "custom",
          path: ["S3_ENDPOINT"],
          message: "Use a trusted HTTPS endpoint or local development MinIO.",
        });
      }
    }
  });

export type StorageEnvironment = {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
};

export function configuredStorageEnvironment(
  env: z.infer<typeof storageEnvironmentSchema>,
): StorageEnvironment | null {
  if (
    !env.S3_ENDPOINT ||
    !env.S3_REGION ||
    !env.S3_BUCKET ||
    !env.S3_ACCESS_KEY_ID ||
    !env.S3_SECRET_ACCESS_KEY
  )
    return null;
  return {
    endpoint: new URL(env.S3_ENDPOINT).origin,
    region: env.S3_REGION,
    bucket: env.S3_BUCKET,
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
  };
}
