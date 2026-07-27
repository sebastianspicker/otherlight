/** Verifies canonical observer geometry produces consistent transit-state interpretation. */

import { describe, expect, it } from "vitest";

import { getPresetById } from "../../src/app/presets";
import { cloneParams, SCENARIO_DEFAULTS } from "../../src/app/scenario";
import type { OrbitElements, SystemParams } from "../../src/core/types";
import { stepSystem } from "../../src/sim/sim";

type TransitSample = {
  tSec: number;
  fluxTransitFactor: number;
  projectedSeparation: number;
  z: number;
};

type PhaseSample = {
  maxPlanetPhase: number;
  maxMoonPhase: number;
};

function orbitPeriod(system: SystemParams): number {
  assertStaticPlanetOrbit(system);
  return system.planet.orbit.period;
}

function assertStaticPlanetOrbit(system: SystemParams): asserts system is SystemParams & {
  planet: SystemParams["planet"] & { orbit: OrbitElements };
} {
  if (typeof system.planet.orbit === "function") {
    throw new Error("canonical-view transit contract requires static orbit elements.");
  }
}

function strongestTransitSample(system: SystemParams, samples = 720): TransitSample {
  const period = orbitPeriod(system);
  let best: TransitSample | undefined;

  for (let i = 0; i < samples; i++) {
    const tSec = (i / samples) * period;
    const step = stepSystem(system, tSec);
    const projectedSeparation = Math.hypot(step.planetSky.x, step.planetSky.y);
    const sample: TransitSample = {
      tSec,
      fluxTransitFactor:
        typeof step.fluxTransitFactor === "number" && Number.isFinite(step.fluxTransitFactor)
          ? step.fluxTransitFactor
          : 1,
      projectedSeparation,
      z: step.planetSky.z,
    };

    if (!best || sample.fluxTransitFactor < best.fluxTransitFactor) {
      best = sample;
    }
  }

  if (!best) throw new Error("expected at least one sampled transit state");
  return best;
}

function strongestPhaseSignals(system: SystemParams, samples = 720): PhaseSample {
  const period = orbitPeriod(system);
  let maxPlanetPhase = 0;
  let maxMoonPhase = 0;

  for (let i = 0; i < samples; i++) {
    const tSec = (i / samples) * period;
    const step = stepSystem(system, tSec);
    maxPlanetPhase = Math.max(maxPlanetPhase, Math.max(0, step.fluxPlanetPhase ?? 0));
    maxMoonPhase = Math.max(maxMoonPhase, Math.max(0, step.fluxMoonPhase ?? 0));
  }

  return { maxPlanetPhase, maxMoonPhase };
}

describe("canonical-view transit contract", () => {
  it("default scenario keeps the seeded bodies and orbit scales visually exaggerated for teaching", () => {
    const system = cloneParams(SCENARIO_DEFAULTS);
    const moon = system.moon;

    if (!moon || typeof system.planet.orbit === "function" || typeof moon.orbitAroundPlanet === "function") {
      throw new Error("expected static default planet and moon orbits");
    }

    expect(system.planet.r / system.star.r).toBeGreaterThan(0.2);
    expect(moon.r / system.star.r).toBeGreaterThan(0.07);
    expect(system.planet.orbit.a / system.star.r).toBeLessThan(4);
    expect(moon.orbitAroundPlanet.a / system.star.r).toBeLessThan(0.4);
  });

  it("default scenario now yields a real front-of-star transit in the canonical viewer frame", () => {
    const system = cloneParams(SCENARIO_DEFAULTS);

    const best = strongestTransitSample(system);

    expect(best.fluxTransitFactor).toBeLessThan(0.999999);
    expect(best.projectedSeparation).toBeLessThan(system.star.r + system.planet.r);
    expect(best.z).toBeGreaterThan(0);
  });

  it("default scenario keeps visible planet and moon phase signals for the didactic model", () => {
    const system = cloneParams(SCENARIO_DEFAULTS);
    const phase = strongestPhaseSignals(system);

    expect(phase.maxPlanetPhase).toBeGreaterThan(0.001);
    expect(phase.maxMoonPhase).toBeGreaterThan(0.0001);
  });

  it("kepler planet-only preset matches the same viewer-facing transit geometry", () => {
    const system = cloneParams(getPresetById("kepler-planet-only").params);

    const best = strongestTransitSample(system);

    expect(best.fluxTransitFactor).toBeLessThan(0.999999);
    expect(best.projectedSeparation).toBeLessThan(system.star.r + system.planet.r);
    expect(best.z).toBeGreaterThan(0);
  });

  it("kepler planet-only preset remains free of additive phase signals", () => {
    const system = cloneParams(getPresetById("kepler-planet-only").params);
    const phase = strongestPhaseSignals(system);

    expect(phase.maxPlanetPhase).toBe(0);
    expect(phase.maxMoonPhase).toBe(0);
  });
});
