/** Configures deterministic compact contract-test discovery. */
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    maxWorkers: 2,
    testTimeout: 30_000,
  },
});
