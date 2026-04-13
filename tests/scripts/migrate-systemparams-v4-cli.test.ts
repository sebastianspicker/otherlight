import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("migrate-systemparams-v4 CLI", () => {
  it("runs with the published Node invocation", () => {
    const stdout = execFileSync(
      process.execPath,
      ["scripts/migrate-systemparams-v4.mjs", "src/config/scenario.default.json"],
      {
        cwd: process.cwd(),
        encoding: "utf8",
      },
    );

    const parsed = JSON.parse(stdout) as { meta?: { version?: number }; defaults?: { version?: string } };
    expect(parsed.meta?.version).toBe(4);
    expect(parsed.defaults?.version).toBe("4");
  });
});
