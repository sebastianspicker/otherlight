/** Configures deterministic compact contract-test discovery. */
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const browserRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: browserRoot,
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    maxWorkers: 2,
    testTimeout: 30_000,
  },
});
