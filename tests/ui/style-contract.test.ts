import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("style.css mobile header contract", () => {
  it("defines small-screen header rules that let selector labels wrap and selects shrink", () => {
    const css = [
      readFileSync(`${process.cwd()}/src/style.css`, "utf8"),
      readFileSync(`${process.cwd()}/src/styles/base.css`, "utf8"),
      readFileSync(`${process.cwd()}/src/styles/shell.css`, "utf8"),
      readFileSync(`${process.cwd()}/src/styles/features.css`, "utf8"),
    ].join("\n");

    expect(css).toContain("@media (max-width: 760px)");
    expect(css).toContain(".app-header > div.help > label.inline");
    expect(css).toContain("white-space: normal");
    expect(css).toContain("min-width: 0");
    expect(css).toContain(".app-header > div.help > label.inline > select");
    expect(css).toContain("width: 100%");
  });
});
