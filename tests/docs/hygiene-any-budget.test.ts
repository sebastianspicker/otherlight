import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { walkTsFiles } from "../helpers/walkTsFiles";

describe("hygiene any budget", () => {
  it("keeps explicit any usage under the current migration budget", () => {
    const root = process.cwd();
    const src = path.join(root, "src");
    const files = walkTsFiles(src);
    const rx = /\bas any\b|:\s*any\b/g;

    let count = 0;
    for (const f of files) {
      const text = fs.readFileSync(f, "utf8");
      const matches = text.match(rx);
      count += matches?.length ?? 0;
    }

    // Iteration-3 migration budget (down from 115 after Phase 1.1 type-safety work).
    expect(count).toBeLessThanOrEqual(50);
  });
});
