/** Enforces documentation file-size limits that keep public guidance reviewable. */

import path from "node:path";
import { describe, expect, it } from "vitest";
import { readTextFileWithinRepo, walkTsFiles } from "../helpers/walkTsFiles";

describe("hygiene file size", () => {
  it("keeps source files below warning threshold", () => {
    const root = process.cwd();
    const files = walkTsFiles(path.join(root, "src"));
    const offenders: string[] = [];
    const threshold = 700;

    for (const file of files) {
      const lines = readTextFileWithinRepo(file).split("\n").length;
      if (lines > threshold) offenders.push(`${path.relative(root, file)} (${lines})`);
    }

    expect(offenders).toEqual([]);
  });
});
