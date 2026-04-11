import { describe, expect, it } from "vitest";

import { DEFAULT_BINARY_LAB_CONFIG_V4 } from "../../src/app/binaryLab";
import {
  binaryFluxDisplayBaseline,
  fluxDisplayTitle,
  fluxValueForDisplay,
  scaleFluxForDisplay,
} from "../../src/app/displayFlux";
import { getPresetById } from "../../src/app/presets";
import { migrateSystemParamsToV4 } from "../../src/sim/v4";

describe("display flux helpers", () => {
  it("normalizes detached-binary flux to the unobscured binary baseline", () => {
    const baseline = binaryFluxDisplayBaseline(DEFAULT_BINARY_LAB_CONFIG_V4);
    const expectedBaseline = 1.2137894473977964;

    expect(baseline).toBeCloseTo(expectedBaseline, 12);
    expect(scaleFluxForDisplay(expectedBaseline, baseline ?? 1)).toBeCloseTo(1, 12);
    expect(fluxDisplayTitle(DEFAULT_BINARY_LAB_CONFIG_V4)).toContain("combined stellar baseline");
  });

  it("leaves preset-lab flux in stellar units", () => {
    const cfg = migrateSystemParamsToV4(getPresetById("default").params);

    expect(binaryFluxDisplayBaseline(cfg)).toBeUndefined();
    expect(scaleFluxForDisplay(1.125, binaryFluxDisplayBaseline(cfg) ?? 1)).toBeCloseTo(1.125, 12);
    expect(fluxDisplayTitle(cfg)).toContain("stellar units");
  });

  it("does not fabricate a detached-binary display baseline from compatibility scaling in scientific-browser mode", () => {
    const cfg = structuredClone(DEFAULT_BINARY_LAB_CONFIG_V4);
    cfg.runtime = { ...(cfg.runtime ?? {}), executionMode: "scientific-browser" };
    cfg.bodies.stars = [
      { id: "star-a", r: 1, m: 2, luminosityScale: 1, passband: "g" },
      { id: "star-b", r: 1, m: 1, luminosityScale: 0.4, passband: "g" },
    ];

    expect(binaryFluxDisplayBaseline(cfg)).toBeUndefined();
  });

  it("exposes the same displayed detached-binary flux value the UI plots", () => {
    const baseline = binaryFluxDisplayBaseline(DEFAULT_BINARY_LAB_CONFIG_V4) ?? 1;
    const flux = baseline * 0.975;

    expect(fluxValueForDisplay(DEFAULT_BINARY_LAB_CONFIG_V4, flux)).toBeCloseTo(0.975, 12);
  });
});
