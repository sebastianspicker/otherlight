import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    environmentMatchGlobs: [["**/tests/ui/**/*.test.ts", "jsdom"]],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/core/types*.ts", "src/style.css"],
      thresholds: {
        statements: 78,
        branches: 65,
        functions: 87,
        lines: 82,
      },
    },
  },
});
