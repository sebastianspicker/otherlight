import { describe, expect, it } from "vitest";

import { appCspForMode } from "../../vite.config";

describe("app CSP contract", () => {
  it("allows Vite dev styling and HMR connections in serve mode", () => {
    const serveCsp = appCspForMode("serve");

    expect(serveCsp).toContain("style-src 'self' 'unsafe-inline'");
    expect(serveCsp).toContain("connect-src 'self' ws: wss:");
  });

  it("keeps the built app on the stricter static CSP", () => {
    const buildCsp = appCspForMode("build");

    expect(buildCsp).toContain("style-src 'self'");
    expect(buildCsp).not.toContain("'unsafe-inline'");
    expect(buildCsp).toContain("connect-src 'self'");
    expect(buildCsp).not.toContain("ws:");
    expect(buildCsp).not.toContain("wss:");
  });
});
