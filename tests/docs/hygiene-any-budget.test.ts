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

    // Iteration-1 migration budget. Reduce in follow-up iterations.
    expect(count).toBeLessThanOrEqual(120);
  });
});
