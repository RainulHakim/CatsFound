import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Use lib/log.ts. Structured logs only in production paths.
      "no-console": "error",
      "@typescript-eslint/consistent-type-imports": "error",
      // Apostrophes and quotes in JSX copy render correctly; the rule only adds noise.
      "react/no-unescaped-entities": "off",
      // Photos are served by our own access-checked route (/api/photos) with a
      // hand-built srcset and blurhash; next/image's optimizer would bypass that.
      "@next/next/no-img-element": "off",
    },
  },
  {
    files: ["tests/**", "scripts/**", "*.config.*"],
    rules: { "no-console": "off" },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
    "CatsFound/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
