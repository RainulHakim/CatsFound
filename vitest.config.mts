import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const alias = { "@": fileURLToPath(new URL(".", import.meta.url)) };

export default defineConfig({
  resolve: { alias },
  test: {
    coverage: {
      provider: "v8",
      include: ["lib/**", "app/api/**"],
      thresholds: { lines: 80, functions: 80, branches: 75, statements: 80 },
    },
    projects: [
      {
        resolve: {
          alias: {
            ...alias,
            "server-only": fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url)),
          },
        },
        test: {
          name: "unit",
          include: ["tests/unit/**/*.test.ts"],
          environment: "node",
        },
      },
      {
        resolve: { alias },
        test: {
          name: "db",
          include: ["tests/integration/db/**/*.test.ts"],
          environment: "node",
          testTimeout: 30_000,
          hookTimeout: 90_000,
          fileParallelism: false,
        },
      },
    ],
  },
});
