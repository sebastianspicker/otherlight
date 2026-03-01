import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { walkTsFiles } from "../helpers/walkTsFiles";

describe("hygiene layering", () => {
  it("sim layer does not import ui layer", () => {
    const root = process.cwd();
    const simRoot = path.join(root, "src", "sim");
    const files = walkTsFiles(simRoot);
    const offenders: string[] = [];
    const rx = /from\s+["'][^"']*\/ui\/[^"']*["']/;

    for (const file of files) {
      const text = fs.readFileSync(file, "utf8");
      if (rx.test(text)) offenders.push(path.relative(root, file));
    }

    expect(offenders).toEqual([]);
  });
});
