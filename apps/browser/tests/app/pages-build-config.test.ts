/** Verifies the dedicated GitHub Pages Vite mode stays isolated from local builds. */

import { describe, expect, it } from "vitest";

import { GITHUB_PAGES_BASE, appSecurityHeadersForMode, appViteConfigFor } from "../../vite.config";

describe("GitHub Pages build configuration", () => {
  it("uses the repository base only for the dedicated Pages mode", () => {
    expect(appViteConfigFor({ command: "build", mode: "github-pages" }).base).toBe(GITHUB_PAGES_BASE);
    expect(appViteConfigFor({ command: "build", mode: "production" }).base).toBe("/");
    expect(appViteConfigFor({ command: "serve", mode: "development" }).base).toBe("/");
  });

  it("keeps Pages preview on the no-loopback static CSP", () => {
    const config = appViteConfigFor({ command: "serve", mode: "github-pages" });

    expect(config.preview?.headers).toEqual(appSecurityHeadersForMode("github-pages"));
  });
});
