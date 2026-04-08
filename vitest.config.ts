import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    environmentMatchGlobs: [["**/tests/ui/**/*.test.ts", "jsdom"]],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/main.ts", "src/core/types*.ts", "src/style.css"],
      thresholds: {
        statements: 59,
        branches: 49,
        functions: 55,
        lines: 62,
      },
    },
  },
});
