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
]);
