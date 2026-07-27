/** Verifies real systems contracts across app startup, controls, and runtime integration. */

import { describe, expect, it } from "vitest";

import { AU_M, DAY_S, DEG2RAD, JUPITER_RADIUS_M, SOLAR_MASS_KG, SOLAR_RADIUS_M } from "../../src/core/units";
import { stepSystem } from "../../src/sim/sim";
import {
  REAL_SYSTEMS_OPTIONS,
  buildParamsFromRealSystem,
  mapSnapshotSystemToParams,
  type RealSystemSnapshotEntry,
} from "../../src/app/realSystems";

describe("real systems mapping", () => {
  it("maps snapshot entry to SystemParams in SI and disables moon", () => {
    const row: RealSystemSnapshotEntry = {
      id: "test-system",
      label: "Test-1 b",
      hostname: "Test-1",
      discYear: 2020,
      starRadiusSolar: 1.1,
      starMassSolar: 0.9,
      planetRadiusJupiter: 1.2,
      planetMassJupiter: 0.7,
      semiMajorAxisAu: 0.07,
      periodDays: 5.6,
      eccentricity: 0.2,
      inclinationDeg: 87.5,
    };

    const out = mapSnapshotSystemToParams(row);
    if (typeof out.planet.orbit === "function") {
      throw new Error("Expected static orbit in mapped params.");
    }
    const orbit = out.planet.orbit;

    expect(out.star.r).toBeCloseTo(1.1 * SOLAR_RADIUS_M, 6);
    expect(out.star.m).toBeCloseTo(0.9 * SOLAR_MASS_KG, 6);
    expect(out.planet.r).toBeCloseTo(1.2 * JUPITER_RADIUS_M, 6);
    expect(orbit.a).toBeCloseTo(0.07 * AU_M, 6);
    expect(orbit.period).toBeCloseTo(5.6 * DAY_S, 6);
    expect(orbit.e).toBeCloseTo(0.2, 12);
    expect(orbit.inc).toBeCloseTo(87.5 * DEG2RAD, 12);
    expect(orbit.Omega).toBe(0);
    expect(orbit.omega).toBe(0);
    expect(orbit.t0).toBe(0);
    expect(out.moon).toBeUndefined();
  });

  it("falls back to circular edge-on orbit when e/inc are missing", () => {
    const row: RealSystemSnapshotEntry = {
      id: "fallback-system",
      label: "Fallback-1 b",
      hostname: "Fallback-1",
      starRadiusSolar: 1,
      planetRadiusEarth: 1.5,
      semiMajorAxisAu: 0.03,
      periodDays: 2,
    };

    const out = mapSnapshotSystemToParams(row);
    if (typeof out.planet.orbit === "function") {
      throw new Error("Expected static orbit in mapped params.");
    }
    const orbit = out.planet.orbit;

    expect(orbit.e).toBe(0);
    expect(orbit.inc).toBeCloseTo(90 * DEG2RAD, 12);
  });

  it("provides options and can build params by id", () => {
    expect(REAL_SYSTEMS_OPTIONS.length).toBeGreaterThan(0);

    const first = REAL_SYSTEMS_OPTIONS[0];
    const out = buildParamsFromRealSystem(first.id);

    expect(Number.isFinite(out.star.r)).toBe(true);
    expect(Number.isFinite(out.planet.r)).toBe(true);
    expect(out.star.r).toBeGreaterThan(0);
    expect(out.planet.r).toBeGreaterThan(0);
    expect(out.moon).toBeUndefined();
  });

  it("runs a finite simulation step for a real system", () => {
    const first = REAL_SYSTEMS_OPTIONS[0];
    const params = buildParamsFromRealSystem(first.id);
    const step = stepSystem(params, 0);

    expect(Number.isFinite(step.fluxTotal)).toBe(true);
    expect(Number.isFinite(step.fluxTransitFactor)).toBe(true);
  });
});
