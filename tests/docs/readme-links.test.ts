import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("README docs links", () => {
  it("references only existing docs/*.md files", () => {
    const root = process.cwd();
    const readme = readFileSync(resolve(root, "README.md"), "utf8");

    const links = new Set<string>();
    const re = /`(docs\/[^`]+\.md)`/g;
    for (const match of readme.matchAll(re)) {
      links.add(match[1]);
    }

    const missing = [...links].filter((p) => !existsSync(resolve(root, p)));
    expect(missing).toEqual([]);
  });
});
