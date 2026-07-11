import { expect, it } from "vitest";

import { toSystemParamsV2FromV4 } from "../../src/sim/v4/adapter";
import type { SimulationConfigV4 } from "../../src/sim/v4/types";

it("maps detached binary config to v2 runtime params", () => {
  const cfg: SimulationConfigV4 = {
    version: "4",
    mode: "detached-binary-lab",
    observer: { dir: { x: 1, y: 0, z: 1 } },
    binaryLab: {
      enabled: true,
      hideSkyUntilReveal: true,
      requireHypothesis: true,
      lockParamsUntilHypothesis: true,
    },
    bodies: {
      stars: [
        {
          id: "star-a",
          r: 6.957e8,
          m: 1.98847e30,
          luminosityScale: 1,
          teffK: 6_200,
          loggCgs: 4.2,
          metallicityDex: -0.05,
          passband: "g",
        },
        {
          id: "star-b",
          r: 5.0e8,
          m: 1.2e30,
          luminosityScale: 0.35,
          teffK: 5_200,
          loggCgs: 4.5,
          metallicityDex: -0.15,
          passband: "g",
        },
      ],
      planets: [],
      moons: [],
    },
    orbits: {
      binary: { a: 1.4e10, e: 0.1, inc: 1.55, Omega: 0.1, omega: 0.3, period: 8.0e5, t0: 0 },
      hierarchy: [],
    },
    photometry: {
      baselineFlux: 1,
    },
  };

  const out = toSystemParamsV2FromV4(cfg);

  expect(out.star.r).toBe(cfg.bodies.stars[0].r);
  expect(out.planet.r).toBe(cfg.bodies.stars[1].r);
  expect(out.moon).toBeUndefined();

  if (typeof out.planet.orbit === "function") {
    throw new Error("Expected static orbit");
  }

  expect(out.planet.orbit.a).toBe(cfg.orbits.binary.a);
  expect(out.planet.orbit.period).toBe(cfg.orbits.binary.period);
  expect(out.star.photometry?.phaseCurve?.enabled).toBe(true);
  expect(out.star.photometry?.phaseCurve?.constant).toBeCloseTo(0.35, 12);
  expect(out.binaryStars?.primary?.teffK).toBe(6_200);
  expect(out.binaryStars?.primary?.passband).toBe("g");
  expect(out.binaryStars?.secondary?.teffK).toBe(5_200);
  expect(out.binaryStars?.secondary?.luminosityScale).toBeCloseTo(0.35, 12);
});

it("maps general-lab config to classic star+planet without forcing binary stellar-B flux", () => {
  const cfg: SimulationConfigV4 = {
    version: "4",
    mode: "general-lab",
    observer: { dir: { x: 0, y: 0, z: 1 } },
    bodies: {
      stars: [
        { id: "star-a", r: 7.0e8, m: 2.0e30, luminosityScale: 1 },
        { id: "star-b", r: 6.0e8, m: 1.1e30, luminosityScale: 0.4 },
      ],
      planets: [
        {
          id: "planet-1",
          r: 7.2e7,
          m: 6.0e26,
          orbit: { a: 7.0e9, e: 0.01, inc: 1.55, Omega: 0, omega: 0, period: 3.1e5, t0: 0 },
          parentStarId: "star-a",
          parentSystem: "star",
        },
      ],
      moons: [],
    },
    orbits: {
      binary: { a: 2.0e10, e: 0.03, inc: 1.5, Omega: 0, omega: 0.1, period: 9.0e5, t0: 0 },
      hierarchy: [{ childId: "planet-1", parentId: "star-a", relation: "orbits" }],
    },
    photometry: {
      baselineFlux: 1,
    },
  };

  const out = toSystemParamsV2FromV4(cfg);

  expect(out.star.r).toBe(cfg.bodies.stars[0].r);
  expect(out.planet.r).toBe(cfg.bodies.planets[0].r);
  expect(typeof out.planet.orbit).toBe("object");
  if (typeof out.planet.orbit === "function") {
    throw new Error("Expected static orbit");
  }
  expect(out.planet.orbit.a).toBe(cfg.bodies.planets[0].orbit.a);
  expect(out.planet.orbit.period).toBe(cfg.bodies.planets[0].orbit.period);
  expect(out.star.photometry?.phaseCurve?.constant ?? 0).toBe(0);
});
