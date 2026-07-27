/** Enforces the documentation any-type budget for reviewable public interfaces. */

import path from "node:path";
import { describe, expect, it } from "vitest";
import { readTextFileWithinRepo, walkTsFiles } from "../helpers/walkTsFiles";

describe("hygiene any budget", () => {
  it("keeps explicit any usage under the current migration budget", () => {
    const root = process.cwd();
    const src = path.join(root, "src");
    const files = walkTsFiles(src);
    const rx = /\bas any\b|:\s*any\b/g;

    let count = 0;
    for (const f of files) {
      const text = readTextFileWithinRepo(f);
      const matches = text.match(rx);
      count += matches?.length ?? 0;
    }

    // ESLint no-explicit-any (error) is the primary enforcement.
    // This test is a secondary safety net; budget matches the 2 remaining
    // false positives (a comment containing "any" + constructor generic `any[]`).
    expect(count).toBeLessThanOrEqual(2);
  });
});
