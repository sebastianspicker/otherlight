/** Configures deterministic unit-test discovery, coverage, and worker behavior. */
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    environmentMatchGlobs: [["**/tests/ui/**/*.test.ts", "jsdom"]],
    // Scientific simulations are CPU-bound. Bound normal runs so parallel
    // Codex/CI work cannot fan out into one worker per logical CPU.
    maxWorkers: 2,
    // Ordinary integration assertions may synchronously evaluate a full orbit.
    // Longer benchmark-specific limits remain explicit in their test files.
    testTimeout: 30_000,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: [
        "src/core/instrumentNoiseTypes.ts",
        "src/core/types*.ts",
        "src/didactics/index.ts",
        "src/render/lightCurvePlotTypes.ts",
        "src/render/sceneTypes.ts",
        "src/sim/nbody/types.ts",
        "src/sim/v3/index.ts",
        "src/sim/v3/types.ts",
        "src/sim/v4/index.ts",
        "src/sim/v4/types.ts",
        "src/sim/validation/index.ts",
        "src/sim/validation/types.ts",
        "src/ui/params/index.ts",
        "src/ui/params.ts",
        "src/ui/refs.ts",
        "src/style.css",
      ],
      thresholds: {
        statements: 78,
        branches: 65,
        functions: 87,
        lines: 82,
      },
    },
  },
});
