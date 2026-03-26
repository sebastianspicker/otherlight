import { describe, expect, it, vi } from "vitest";
import { drawDebugOverlayV3 } from "../../src/render/overlays";

describe("drawDebugOverlayV3", () => {
  it("renders key diagnostics from V3 payload", () => {
    const fillText = vi.fn();
    const ctx = {
      save: vi.fn(),
      restore: vi.fn(),
      fillText,
      fillStyle: "",
      font: "",
    } as any;

    drawDebugOverlayV3(
      ctx,
      { dpr: 1, cssW: 400, cssH: 240, pxW: 400, pxH: 240 },
      {
        nOcculters: 2,
        bPlanet: 0.12,
        bMoon: 0.48,
        tdvRatio: 1.0234,
        baselineFluxUsed: 1,
        stellarVariabilityFlux: 0.0003,
        fluxTransitFactor: 0.991,
        fluxTotal: 0.9932,
      },
      { x: 0, y: 0, z: 1 },
      {
        showObserverDir: false,
        showObserverMarker: false,
        showOcculters: true,
        showImpactParams: true,
        showTDV: true,
        showFluxDecomposition: true,
      },
    );

    const lines = fillText.mock.calls.map((c) => String(c[0]));
    expect(lines.some((s) => s.includes("Occulters = 2"))).toBe(true);
    expect(lines.some((s) => s.includes("b_planet"))).toBe(true);
    expect(lines.some((s) => s.includes("TDV ratio"))).toBe(true);
    expect(lines.some((s) => s.includes("F_transit"))).toBe(true);
    expect(lines.some((s) => s.includes("F_total"))).toBe(true);
  });
});
