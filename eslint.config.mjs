import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    // `src/app` renders and routes; it does not query. Every page's and every
    // handler's data lives behind a named service in `src/lib`, which is what
    // makes each one a single call away from becoming an HTTP request if the
    // backend is ever split out. Reaching for the Prisma client here
    // reintroduces exactly the coupling that separation has to unpick.
    files: ["src/app/**/*.ts", "src/app/**/*.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/lib/db",
              message:
                "src/app must not query the database directly. Add a service function in src/lib and call that instead.",
            },
          ],
        },
      ],
    },
  },
  {
    // Pages additionally must not depend on Prisma's types: whatever a page
    // renders has to survive JSON, so the service owns the wire shape.
    // Route handlers still need `Prisma` for enum types and the DbNull sentinel.
    files: ["src/app/**/page.tsx", "src/app/**/layout.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/lib/db",
              message:
                "Pages must not query the database directly. Add a service function in src/lib and call that instead.",
            },
            {
              name: "@prisma/client",
              message:
                "Pages must not depend on Prisma. Expose a JSON-safe type from the src/lib service instead.",
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
