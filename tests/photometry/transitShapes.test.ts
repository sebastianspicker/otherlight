/** Verifies transit shapes calculations in the observable-light and transit model. */

import { describe, expect, it } from "vitest";

import {
  fluxLimbDarkenedDiskShapes,
  fluxUniformDiskShapes,
  fluxUniformDiskWithPatchesShapes,
} from "../../src/photometry/transitShapes";

const circleOcculter = (dx: number, dy: number, r: number) => ({ dx, dy, r });

describe("fluxUniformDiskShapes", () => {
  it("returns 1.0 with no occulters", () => {
    expect(fluxUniformDiskShapes({ rStar: 1 })).toBeCloseTo(1, 10);
  });

  it("returns 1.0 with empty occulters array", () => {
    expect(fluxUniformDiskShapes({ rStar: 1, occulters: [] })).toBeCloseTo(1, 10);
  });

  it("returns < 1.0 when an occulter partially covers the star", () => {
    const flux = fluxUniformDiskShapes({
      rStar: 1,
      occulters: [circleOcculter(0, 0, 0.3)],
    });
    expect(flux).toBeGreaterThan(0);
    expect(flux).toBeLessThan(1);
  });

  it("returns ~0 when occulter fully covers the star", () => {
    const flux = fluxUniformDiskShapes({
      rStar: 1,
      occulters: [circleOcculter(0, 0, 2)],
    });
    expect(flux).toBeCloseTo(0, 2);
  });

  it("returns 1.0 when occulter is fully outside the stellar disk", () => {
    const flux = fluxUniformDiskShapes({
      rStar: 1,
      occulters: [circleOcculter(5, 0, 0.1)],
    });
    expect(flux).toBeCloseTo(1, 5);
  });

  it("is symmetric for left/right offset occulters", () => {
    const left = fluxUniformDiskShapes({
      rStar: 1,
      occulters: [circleOcculter(-0.4, 0, 0.2)],
    });
    const right = fluxUniformDiskShapes({
      rStar: 1,
      occulters: [circleOcculter(0.4, 0, 0.2)],
    });
    expect(Math.abs(left - right)).toBeLessThan(5e-3);
  });

  it("throws on non-positive rStar", () => {
    expect(() => fluxUniformDiskShapes({ rStar: 0 })).toThrow("rStar must be a positive finite number");
    expect(() => fluxUniformDiskShapes({ rStar: -1 })).toThrow();
    expect(() => fluxUniformDiskShapes({ rStar: NaN })).toThrow();
  });

  it("accepts a custom gridRes", () => {
    const flux = fluxUniformDiskShapes({
      rStar: 1,
      occulters: [circleOcculter(0, 0, 0.3)],
      gridRes: 50,
    });
    expect(flux).toBeGreaterThan(0);
    expect(flux).toBeLessThan(1);
  });
});

describe("fluxUniformDiskWithPatchesShapes", () => {
  it("returns 1.0 with no occulters", () => {
    expect(
      fluxUniformDiskWithPatchesShapes({
        rStar: 1,
        occulters: [],
      }),
    ).toBeCloseTo(1, 10);
  });

  it("returns < 1.0 with a partial central occulter", () => {
    const flux = fluxUniformDiskWithPatchesShapes({
      rStar: 1,
      occulters: [circleOcculter(0, 0, 0.3)],
    });
    expect(flux).toBeGreaterThan(0);
    expect(flux).toBeLessThan(1);
  });

  it("throws on non-positive rStar", () => {
    expect(() =>
      fluxUniformDiskWithPatchesShapes({ rStar: 0, occulters: [circleOcculter(0, 0, 0.5)] }),
    ).toThrow("rStar must be a positive finite number");
  });

  it("produces flux in [0, 1] with brightness patches", () => {
    const flux = fluxUniformDiskWithPatchesShapes({
      rStar: 1,
      occulters: [circleOcculter(0.2, 0, 0.25)],
      brightnessPatches: [{ shape: "circle" as const, x: 0, y: 0, r: 0.3, factor: 0.5 }],
    });
    expect(flux).toBeGreaterThanOrEqual(0);
    expect(flux).toBeLessThanOrEqual(1);
  });
});

describe("fluxLimbDarkenedDiskShapes", () => {
  const law = { kind: "quadratic" as const, u1: 0.3, u2: 0.2 };

  it("returns 1.0 with no occulters", () => {
    expect(
      fluxLimbDarkenedDiskShapes({
        rStar: 1,
        occulters: [],
        limbDarkeningLaw: law,
      }),
    ).toBeCloseTo(1, 10);
  });

  it("returns < 1.0 with a central occulter", () => {
    const flux = fluxLimbDarkenedDiskShapes({
      rStar: 1,
      occulters: [circleOcculter(0, 0, 0.3)],
      limbDarkeningLaw: law,
    });
    expect(flux).toBeGreaterThan(0);
    expect(flux).toBeLessThan(1);
  });

  it("limb-darkened flux is lower for center transit than edge transit", () => {
    // Center transit blocks the brightest region → deeper dip
    const center = fluxLimbDarkenedDiskShapes({
      rStar: 1,
      occulters: [circleOcculter(0, 0, 0.2)],
      limbDarkeningLaw: law,
    });
    // Edge transit blocks dimmer limb region → shallower dip
    const edge = fluxLimbDarkenedDiskShapes({
      rStar: 1,
      occulters: [circleOcculter(0.75, 0, 0.2)],
      limbDarkeningLaw: law,
    });
    expect(center).toBeLessThan(edge);
  });

  it("throws on non-positive rStar", () => {
    expect(() =>
      fluxLimbDarkenedDiskShapes({
        rStar: -1,
        occulters: [circleOcculter(0, 0, 0.3)],
        limbDarkeningLaw: law,
      }),
    ).toThrow("rStar must be a positive finite number");
  });

  it("throws when limbDarkeningLaw is missing", () => {
    expect(() =>
      fluxLimbDarkenedDiskShapes({
        rStar: 1,
        occulters: [circleOcculter(0, 0, 0.3)],
        limbDarkeningLaw: null as never,
      }),
    ).toThrow("limbDarkeningLaw must be provided");
  });

  it("produces flux in [0, 1] with brightness patches", () => {
    const flux = fluxLimbDarkenedDiskShapes({
      rStar: 1,
      occulters: [circleOcculter(0.2, 0, 0.25)],
      limbDarkeningLaw: law,
      brightnessPatches: [{ shape: "circle" as const, x: 0, y: 0, r: 0.3, factor: 0.8 }],
    });
    expect(flux).toBeGreaterThanOrEqual(0);
    expect(flux).toBeLessThanOrEqual(1);
  });
});
