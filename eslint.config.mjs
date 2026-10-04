import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";

export default defineConfig([
  ...nextVitals,
  ...nextTypeScript,
  prettier,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
    "next-env.d.ts",
    "src/server/db/generated/**",
  ]),
  {
    files: ["src/app/**/*.{ts,tsx}", "src/components/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@prisma/**",
                "@/server/db",
                "@/server/db/**",
                "@/server/repositories",
                "@/server/repositories/**",
                "**/server/db/**",
                "**/server/repositories/**",
              ],
              message:
                "UI and route entry points must use feature/service boundaries, not database access.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/components/**/*.{ts,tsx}", "src/lib/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@prisma/**",
                "pg",
                "@/server",
                "@/server/**",
                "**/server/**",
                "@/features/**",
                "**/features/**",
              ],
              message:
                "Shared UI and presentation utilities must not import server infrastructure or feature modules. Pass safe display values from a route or feature container.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/server/repositories/**/*.ts"],
    ignores: ["**/*.test.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "react",
                "react/**",
                "next",
                "next/**",
                "@/app/**",
                "@/components/**",
                "@/features/**",
                "**/app/**",
                "**/components/**",
                "**/features/**",
                "@/server/auth",
                "@/server/auth/**",
                "@/server/services/**",
                "@/server/storage/**",
                "@/server/providers/**",
                "@/server/ai/**",
                "**/auth",
                "**/auth/**",
                "**/services/**",
                "**/storage/**",
                "**/providers/**",
                "**/ai/**",
              ],
              message:
                "Repositories own persistence only. Services own authorization, domain workflows and external adapters.",
            },
            {
              group: ["@/server/db/transaction", "**/db/transaction"],
              importNames: ["withTransaction"],
              message:
                "The outer service owns the transaction; repositories receive its TransactionClient.",
            },
          ],
        },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "Program:not(:has(ImportDeclaration[source.value='server-only']))",
          message: "Every application repository must import server-only.",
        },
        {
          selector: "CallExpression[callee.property.name='$transaction']",
          message:
            "Repositories must not start transactions. Receive the outer service's transaction instead.",
        },
      ],
    },
  },
  {
    files: ["src/server/services/**/*.ts"],
    ignores: ["**/*.test.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "react",
                "react/**",
                "next",
                "next/**",
                "@/app/**",
                "@/components/**",
                "**/app/**",
                "**/components/**",
                "@/features/**/components/**",
                "**/features/**/components/**",
                "@/features/**/actions",
                "**/features/**/actions",
                "@/features/**/queries.server",
                "**/features/**/queries.server",
              ],
              message:
                "Services must stay independent of UI and request entry points. Neutral feature contracts are allowed.",
            },
            {
              group: ["@/server/db/client", "**/db/client"],
              message:
                "Services own transactions and domain rules; database queries belong in repositories.",
            },
          ],
        },
      ],
    },
  },
]);
