/** Verifies hill warnings calculations in orbital dynamics and numerical integration. */

import { describe, expect, it } from "vitest";

import { cloneParams, SCENARIO_DEFAULTS } from "../../src/app/scenario";
import { validateSystemParamsPhysics } from "../../src/physics/hill";
import {
  hillRadiusAtDistance,
  maxStableProgradeMoonAxisDomingos,
  maxStableRetrogradeMoonAxisDomingos,
} from "../../src/physics/hillRadius";

describe("Hill-radius formulae", () => {
  it("uses the classical restricted-three-body mass ratio", () => {
    expect(hillRadiusAtDistance(12, 1, 8)).toBeCloseTo(12 * Math.cbrt(1 / 24), 12);
  });

  it("implements both Domingos eccentricity fits", () => {
    expect(maxStableProgradeMoonAxisDomingos(10, 0.1, 0.2)).toBeCloseTo(
      10 * 0.4895 * (1 - 1.0305 * 0.1 - 0.2738 * 0.2),
      12,
    );
    expect(maxStableRetrogradeMoonAxisDomingos(10, 0.1, 0.2)).toBeCloseTo(
      10 * 0.9309 * (1 - 1.0764 * 0.1 - 0.9812 * 0.2 + 0.9446 * 0.1 * 0.2),
      12,
    );
  });

  it("applies the Domingos planet-eccentricity factor only once", () => {
    const params = cloneParams(SCENARIO_DEFAULTS);
    const planetOrbit = params.planet.orbit;
    const moonOrbit = params.moon?.orbitAroundPlanet;
    if (typeof planetOrbit === "function" || typeof moonOrbit === "function" || !moonOrbit) {
      throw new Error("expected static default orbits");
    }
    planetOrbit.e = 0.1;
    params.planet.m = (params.star.m as number) * 1e-3;

    const result = validateSystemParamsPhysics(params).find((message) =>
      ["MOON_HILL_OK", "MOON_BEYOND_HILL_STABILITY"].includes(message.code),
    );
    const hillSemimajor =
      planetOrbit.a * Math.cbrt((params.planet.m as number) / (3 * (params.star.m as number)));
    const expected = maxStableProgradeMoonAxisDomingos(hillSemimajor, planetOrbit.e, moonOrbit.e);

    expect(result?.details?.aCrit_sense).toBeCloseTo(expected, 12);
  });
});

describe("validateSystemParamsPhysics (Hill apoapsis)", () => {
  it("warns when moon apoapsis exceeds the Hill radius", () => {
    const params = cloneParams(SCENARIO_DEFAULTS);
    (params.moon!.orbitAroundPlanet as any).a = 1e9;
    (params.moon!.orbitAroundPlanet as any).e = 0;

    const warnings = validateSystemParamsPhysics(params);
    expect(warnings.some((w) => w.code === "MOON_APO_OUTSIDE_HILL")).toBe(true);
  });

  it("does not warn for the default scenario", () => {
    const params = cloneParams(SCENARIO_DEFAULTS);
    const warnings = validateSystemParamsPhysics(params);
    expect(warnings.some((w) => w.code === "MOON_APO_OUTSIDE_HILL")).toBe(false);
  });

  it("uses sense-aware (retrograde) stability messaging", () => {
    const params = cloneParams(SCENARIO_DEFAULTS);
    params.moon!.sense = "retrograde";
    params.planet.m = (params.star.m as number) * 1e-3;
    (params.moon!.orbitAroundPlanet as any).a = 1e9;
    const warnings = validateSystemParamsPhysics(params);
    const msg = warnings.find((w) => w.code === "MOON_BEYOND_HILL_STABILITY");
    if (!msg) throw new Error("expected MOON_BEYOND_HILL_STABILITY warning");
    expect(String(msg.message).toLowerCase().includes("retrograde")).toBe(true);
  });

  it.each([
    { label: "planet eccentricity", ePlanet: 0.900_001, eMoon: 0.1, massRatio: 1e-3 },
    { label: "satellite eccentricity", ePlanet: 0.1, eMoon: 0.500_001, massRatio: 1e-3 },
    { label: "planet/star mass ratio", ePlanet: 0.1, eMoon: 0.1, massRatio: 2e-3 },
  ])("does not assert the fitted stability threshold beyond the sampled $label domain", (sample) => {
    const params = cloneParams(SCENARIO_DEFAULTS);
    const planetOrbit = params.planet.orbit;
    const moonOrbit = params.moon?.orbitAroundPlanet;
    if (typeof planetOrbit === "function" || typeof moonOrbit === "function" || !moonOrbit) {
      throw new Error("expected static default orbits");
    }
    planetOrbit.e = sample.ePlanet;
    moonOrbit.e = sample.eMoon;
    params.planet.m = (params.star.m as number) * sample.massRatio;

    const messages = validateSystemParamsPhysics(params);

    expect(messages.some((message) => message.code === "HILL_FIT_OUT_OF_DOMAIN")).toBe(true);
    expect(messages.some((message) => message.code === "MOON_HILL_OK")).toBe(false);
    expect(messages.some((message) => message.code === "MOON_BEYOND_HILL_STABILITY")).toBe(false);
  });
});
