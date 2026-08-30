/** Verifies the browser shell and runtime remain compatible with the declared CSP. */

import { describe, expect, it } from "vitest";

import { appCspForMode, appCspMetaForMode, appSecurityHeadersForMode } from "../../vite.config";
import { renderComparisonControls } from "../../src/presentation/ui/templates/sidebarDidacticsControls";

describe("app CSP contract", () => {
  it("allows Vite dev styling and HMR connections in serve mode", () => {
    const serveCsp = appCspForMode("serve");

    expect(serveCsp).toContain("style-src 'self' 'unsafe-inline'");
    expect(serveCsp).toContain("connect-src 'self' http://127.0.0.1:8765");
    expect(serveCsp).not.toContain("[::1]");
    expect(serveCsp).toContain("ws: wss:");
  });

  it("keeps the built app on the stricter static CSP", () => {
    const buildCsp = appCspForMode("build");

    expect(buildCsp).toContain("style-src 'self'");
    expect(buildCsp).not.toContain("'unsafe-inline'");
    expect(buildCsp).toContain("connect-src 'self'");
    expect(buildCsp).toContain("http://127.0.0.1:8765");
    expect(buildCsp).not.toContain("ws:");
    expect(buildCsp).not.toContain("wss:");
  });

  it("delivers anti-framing through response headers instead of an ineffective meta directive", () => {
    expect(appCspMetaForMode("build")).not.toContain("frame-ancestors");
    expect(appSecurityHeadersForMode("build")).toMatchObject({
      "Content-Security-Policy": expect.stringContaining("frame-ancestors 'none'"),
      "X-Frame-Options": "DENY",
    });
  });

  it("keeps repository-authored templates compatible with the strict built style policy", () => {
    expect(renderComparisonControls()).not.toMatch(/\sstyle=/i);
  });
});
