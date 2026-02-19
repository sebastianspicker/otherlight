import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function walkTsFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkTsFiles(full, out);
      continue;
    }
    if (entry.isFile() && full.endsWith(".ts")) out.push(full);
  }
  return out;
}

describe("hygiene file size", () => {
  it("keeps source files below warning threshold", () => {
    const root = process.cwd();
    const files = walkTsFiles(path.join(root, "src"));
    const offenders: string[] = [];
    const threshold = 700;

    for (const file of files) {
      const lines = fs.readFileSync(file, "utf8").split("\n").length;
      if (lines > threshold) offenders.push(`${path.relative(root, file)} (${lines})`);
    }

    expect(offenders).toEqual([]);
  });
});
