/** Verifies scenario adapter compatibility across the browser and science-service boundary. */

import { describe, expect, it } from "vitest";
import type { OrbitElements, SystemParams } from "../../src/core/types";
import { G_SI } from "../../src/core/units";
import {
  DEFAULT_EPOCH_JD_TDB,
  ScienceValidationError,
  buildScientificForwardRequestFromSystemParams,
  buildScientificScenarioV5FromSystemParams,
} from "../../src/science";

const period = (semiMajorAxisM: number, totalMassKg: number): number =>
  2 * Math.PI * Math.sqrt(semiMajorAxisM ** 3 / (G_SI * totalMassKg));

const orbit = (semiMajorAxisM: number, totalMassKg: number): OrbitElements => ({
  a: semiMajorAxisM,
  e: 0.1,
  inc: 0.2,
  Omega: 0.3,
  omega: 0.4,
  period: period(semiMajorAxisM, totalMassKg),
  t0: -500,
});

const starMassKg = 1.8e30;
const planetMassKg = 1.2e27;
const moonMassKg = 7.4e22;

const generalSystem = (): SystemParams => ({
  observer: { dir: { x: 0, y: 0, z: 2 } },
  star: { r: 6.0e8, m: starMassKg },
  planet: {
    r: 7.0e7,
    m: planetMassKg,
    orbit: orbit(1.0e11, starMassKg + planetMassKg + moonMassKg),
  },
  moon: {
    r: 1.7e6,
    m: moonMassKg,
    orbitAroundPlanet: orbit(5.0e8, planetMassKg + moonMassKg),
  },
});

const centreOfMassComponent = (
  bodies: ReturnType<typeof buildScientificScenarioV5FromSystemParams>["bodies"],
  field: "positionM" | "velocityMps",
  axis: 0 | 1 | 2,
): number => {
  const total = bodies.reduce((sum, body) => sum + body.massKg, 0);
  return bodies.reduce((sum, body) => sum + body.massKg * body.state[field][axis], 0) / total;
};

describe("V5 SystemParams scenario adapter", () => {
  it("builds a barycentric static star/planet/moon state with a numeric TDB epoch", () => {
    const scenario = buildScientificScenarioV5FromSystemParams({
      system: generalSystem(),
      binaryMode: false,
      epochJdTdb: 2_461_236.5,
      targetBodyId: "planet",
    });

    expect(scenario.bodies.map((body) => [body.id, body.kind])).toEqual([
      ["star", "star"],
      ["planet", "planet"],
      ["moon", "moon"],
    ]);
    expect(scenario.epochJdTdb).toBe(2_461_236.5);
    expect(scenario.observer).toEqual({ lineOfSight: [0, 0, 1], targetBodyId: "planet" });
    for (const field of ["positionM", "velocityMps"] as const) {
      for (const axis of [0, 1, 2] as const) {
        expect(Math.abs(centreOfMassComponent(scenario.bodies, field, axis))).toBeLessThan(1e-6);
      }
    }
  });

  it("maps a detached binary to star and companion and builds an RV-only request", () => {
    const system = generalSystem();
    delete system.moon;
    system.planet.orbit = orbit(2.0e10, starMassKg + planetMassKg);
    const scenario = buildScientificScenarioV5FromSystemParams({ system, binaryMode: true });
    const request = buildScientificForwardRequestFromSystemParams({
      system,
      binaryMode: true,
      startOffsetSec: -60,
      endOffsetSec: 60,
      sampleCadenceSec: 30,
      seed: 7,
    });

    expect(scenario.epochJdTdb).toBe(DEFAULT_EPOCH_JD_TDB);
    expect(scenario.bodies.map((body) => body.kind)).toEqual(["star", "companion"]);
    expect(request.outputs).toEqual(["radial-velocity"]);
  });

  it("uses the mass-derived period for a rounded static orbit with nonzero t0", () => {
    const exactSystem = generalSystem();
    const roundedSystem = generalSystem();
    const roundedOrbit = roundedSystem.planet.orbit as OrbitElements;
    roundedSystem.planet.orbit = { ...roundedOrbit, period: roundedOrbit.period * (1 + 1e-6) };

    const exact = buildScientificScenarioV5FromSystemParams({ system: exactSystem, binaryMode: false });
    const rounded = buildScientificScenarioV5FromSystemParams({ system: roundedSystem, binaryMode: false });

    expect((roundedSystem.planet.orbit as OrbitElements).t0).not.toBe(0);
    expect(rounded.bodies).toEqual(exact.bodies);
  });

  it("fails closed for providers, inconsistent periods, missing masses, and unsupported dynamics", () => {
    const providerSystem = generalSystem();
    const staticPlanetOrbit = providerSystem.planet.orbit as OrbitElements;
    providerSystem.planet.orbit = () => staticPlanetOrbit;
    expect(() =>
      buildScientificScenarioV5FromSystemParams({ system: providerSystem, binaryMode: false }),
    ).toThrow(/providers are unsupported/);

    const inconsistent = generalSystem();
    inconsistent.planet.orbit = { ...(inconsistent.planet.orbit as OrbitElements), period: 1 };
    expect(() =>
      buildScientificScenarioV5FromSystemParams({ system: inconsistent, binaryMode: false }),
    ).toThrow(/inconsistent/);

    const missingMass = generalSystem();
    delete missingMass.moon!.m;
    expect(() =>
      buildScientificScenarioV5FromSystemParams({ system: missingMass, binaryMode: false }),
    ).toThrow(/moon.m/);

    const unsupported = generalSystem();
    unsupported.dynamics = { relativity: { enabled: true } };
    expect(() =>
      buildScientificScenarioV5FromSystemParams({ system: unsupported, binaryMode: false }),
    ).toThrow(ScienceValidationError);
  });
});
