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

describe("boundary hygiene", () => {
  it("contains no production imports from src/experimental", () => {
    const root = process.cwd();
    const srcRoot = path.join(root, "src");
    const files = walkTsFiles(srcRoot);

    const offenders: string[] = [];
    const importRx = /import\s+[^\n]*from\s+["'][^"']*experimental[^"']*["']/;

    for (const file of files) {
      const text = fs.readFileSync(file, "utf8");
      if (importRx.test(text)) {
        offenders.push(path.relative(root, file));
      }
    }

    expect(offenders).toEqual([]);
  });
});
