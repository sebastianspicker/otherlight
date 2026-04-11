import { describe, expect, it } from "vitest";

import { cloneParams, SCENARIO_DEFAULTS } from "../../src/app/scenario";
import { computeTransitFlux } from "../../src/sim/transitFlux";
import type { BodyKinematics } from "../../src/sim/kinematics";
import type { OcculterShape } from "../../src/photometry/occulterEllipse";
import type { SystemParams } from "../../src/core/types";

function defaults(): SystemParams {
  return cloneParams(SCENARIO_DEFAULTS);
}

function makeKin(overrides?: Partial<BodyKinematics>): BodyKinematics {
  return {
    planetOrbit: {
      a: 1e11,
      e: 0,
      inc: Math.PI / 2,
      Omega: 0,
      omega: 0,
      period: 86400 * 3,
      t0: 0,
    },
    rBary: { x: 0, y: 0, z: 0 },
    rPlanetAbs: { x: 0, y: 0, z: 1e11 },
    planetSky: { x: 0, y: 0, z: 1e11 },
    ...overrides,
  };
}

describe("computeTransitFlux", () => {
  it("returns 1.0 when no occulters are present", () => {
    const params = defaults();
    const kin = makeKin();
    const flux = computeTransitFlux(params, [], kin);
    expect(flux).toBe(1.0);
  });

  it("returns value in [0, 1] when a planet occulter is in front of the star", () => {
    const params = defaults();
    const rStar = params.star.r;
    const rPlanet = params.planet.r;
    // Centered transit
    const occulters: OcculterShape[] = [{ dx: 0, dy: 0, r: rPlanet }];
    const kin = makeKin({ planetSky: { x: 0, y: 0, z: rStar * 10 } });
    const flux = computeTransitFlux(params, occulters, kin);
    expect(flux).toBeGreaterThanOrEqual(0);
    expect(flux).toBeLessThanOrEqual(1);
    // Should show dimming
    expect(flux).toBeLessThan(1.0);
  });

  it("returns 1.0 when planet is far off-axis (no overlap)", () => {
    const params = defaults();
    const rStar = params.star.r;
    const rPlanet = params.planet.r;
    // Far away from star disk
    const occulters: OcculterShape[] = [{ dx: rStar * 100, dy: 0, r: rPlanet }];
    const kin = makeKin({ planetSky: { x: rStar * 100, y: 0, z: rStar * 10 } });
    const flux = computeTransitFlux(params, occulters, kin);
    expect(flux).toBe(1.0);
  });

  it("returns 1.0 when projected overlap exists but the occulter is behind the star plane", () => {
    const params = defaults();
    const rStar = params.star.r;
    const rPlanet = params.planet.r;
    const occulters: OcculterShape[] = [{ dx: 0, dy: rStar * 0.2, r: rPlanet }];
    const kin = makeKin({ planetSky: { x: 0, y: rStar * 0.2, z: -rStar * 10 } });
    const flux = computeTransitFlux(params, occulters, kin);
    expect(flux).toBe(1.0);
  });

  it("throws when star radius is invalid", () => {
    const params = defaults();
    params.star.r = -1;
    const kin = makeKin();
    expect(() => computeTransitFlux(params, [], kin)).toThrow(
      "params.star.r must be a positive finite number",
    );
  });

  it("throws when star radius is NaN", () => {
    const params = defaults();
    params.star.r = NaN;
    const kin = makeKin();
    expect(() => computeTransitFlux(params, [], kin)).toThrow();
  });

  it("fails open to 1.0 when LD module errors out", () => {
    const params = defaults();
    // LD model configured but no module loaded — should fall through gracefully
    params.star.photometry = {
      ...params.star.photometry,
      limbDarkeningModel: {
        default: { kind: "quadratic", u1: 0.4, u2: 0.3 },
      },
    };
    const kin = makeKin();
    const flux = computeTransitFlux(params, [], kin);
    expect(flux).toBe(1.0);
  });

  it("handles brightness patches gracefully", () => {
    const params = defaults();
    const rStar = params.star.r;
    const rPlanet = params.planet.r;
    params.star.photometry = {
      ...params.star.photometry,
      brightnessPatches: [{ shape: "circle", x: 0, y: 0, r: rStar * 0.3, factor: 0.5 }],
    };
    const occulters: OcculterShape[] = [{ dx: 0, dy: 0, r: rPlanet }];
    const kin = makeKin({ planetSky: { x: 0, y: 0, z: rStar * 10 } });
    const flux = computeTransitFlux(params, occulters, kin);
    expect(flux).toBeGreaterThanOrEqual(0);
    expect(flux).toBeLessThanOrEqual(1);
  });

  it("output is always clamped to [0, 1]", () => {
    const params = defaults();
    const kin = makeKin();
    // Even with extreme inputs, result must be clamped
    for (const dx of [0, 100, -100]) {
      for (const r of [1, params.star.r * 10]) {
        const flux = computeTransitFlux(params, [{ dx, dy: 0, r }], kin);
        expect(flux).toBeGreaterThanOrEqual(0);
        expect(flux).toBeLessThanOrEqual(1);
      }
    }
  });
});
