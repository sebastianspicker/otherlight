import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { walkTsFiles } from "../helpers/walkTsFiles";

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
