/** Verifies that non-aborting N-body close encounters remain visible in step diagnostics. */

import { describe, expect, it } from "vitest";

import type { SystemParams } from "../../src/core/types";
import { stepSystem } from "../../src/sim/sim";
import { cloneState, findBaseEntryForTarget, storeEntry } from "../../src/sim/nbody/cache";
import { integrateToTimeWithConfig } from "../../src/sim/nbody/integrator";
import { minimumVerletStepSeparation } from "../../src/sim/nbody/integratorCollision";
import { integrateStepWithConfig } from "../../src/sim/nbody/integratorVerlet";
import {
  NBODY_CACHE_MAX,
  type NBodyCacheEntry,
  type NBodyState,
  type ResolvedNBodyConfig,
} from "../../src/sim/nbody/types";

function circularPeriod(a: number, mu: number): number {
  return 2 * Math.PI * Math.sqrt(a ** 3 / mu);
}

describe("N-body collision warning diagnostics", () => {
  it("retains a close-encounter validity flag when collisionPolicy is warn", () => {
    const muStar = 1;
    const muPlanet = 1e-3;
    const muMoon = 1e-6;
    const planetA = 1;
    const moonA = 0.1;
    const params: SystemParams = {
      star: { r: 0.01 },
      planet: {
        r: 0.001,
        orbit: {
          a: planetA,
          e: 0,
          inc: 0,
          Omega: 0,
          omega: 0,
          period: circularPeriod(planetA, muStar + muPlanet + muMoon),
          t0: 0,
        },
      },
      moon: {
        r: 0.0001,
        orbitAroundPlanet: {
          a: moonA,
          e: 0,
          inc: 0,
          Omega: 0,
          omega: 0,
          period: circularPeriod(moonA, muPlanet + muMoon),
          t0: 0,
        },
      },
      dynamics: {
        nbodyPlanetMoon: {
          enabled: true,
          muStar,
          muPlanet,
          muMoon,
          dtMax: 0.01,
        },
        collisionPolicy: { enabled: true, minSeparation: 0.2, onCloseEncounter: "warn" },
      },
    };

    const result = stepSystem(params, 0.01);

    expect(result.meta?.advancedTiming?.closeEncounterDistance).toBeLessThan(0.2);
    expect(result.meta?.advancedTiming?.validityFlags).toContain("close-encounter");
  });

  it.each([
    { position: -1, velocity: 2, dt: 1 },
    { position: 1, velocity: 2, dt: -1 },
  ])("aborts a start-safe/end-safe swept crossing in either time direction", ({ position, velocity, dt }) => {
    const state = crossingState(position, velocity);
    const cfg = crossingConfig("abort");

    expect(() => integrateStepWithConfig({ state, dt, cfg })).toThrow(/swept close encounter/);
  });

  it("retains an interior swept warning even when both step endpoints are safe", () => {
    const state = integrateStepWithConfig({
      state: crossingState(-1, 2),
      dt: 1,
      cfg: crossingConfig("warn"),
    });

    expect(state.rP.x).toBeCloseTo(1, 12);
    expect(state.minimumEncounterDistance).toBeCloseTo(0, 12);
  });

  it("finds the global minimum of a curved quadratic Verlet path", () => {
    const minimum = minimumVerletStepSeparation({
      positions: [
        { x: 100, y: 0, z: 0 },
        { x: -1, y: 0, z: 0 },
        { x: 0, y: 0, z: 0 },
      ],
      velocities: [
        { x: 0, y: 0, z: 0 },
        { x: 0, y: 0, z: 0 },
        { x: 0, y: 0, z: 0 },
      ],
      accelerations: [
        { x: 0, y: 0, z: 0 },
        { x: 4, y: 0, z: 0 },
        { x: 0, y: 0, z: 0 },
      ],
      dt: 1,
    });

    expect(minimum).toBeCloseTo(0, 12);
  });

  it("never exceeds a dense sampled minimum for deterministic quadratic paths", () => {
    let seed = 0x5eed1234;
    const random = (): number => {
      seed = (Math.imul(seed, 1_664_525) + 1_013_904_223) >>> 0;
      return seed / 0x1_0000_0000;
    };
    const component = (): number => 4 * random() - 2;

    for (let sample = 0; sample < 64; sample++) {
      const position = { x: component(), y: component(), z: component() };
      const velocity = { x: component(), y: component(), z: component() };
      const acceleration = { x: component(), y: component(), z: component() };
      const exact = minimumVerletStepSeparation({
        positions: [{ x: 0, y: 0, z: 0 }, position],
        velocities: [{ x: 0, y: 0, z: 0 }, velocity],
        accelerations: [{ x: 0, y: 0, z: 0 }, acceleration],
        dt: 1,
      });
      let sampledMinimum = Number.POSITIVE_INFINITY;
      for (let index = 0; index <= 4096; index++) {
        const u = index / 4096;
        const x = position.x + velocity.x * u + 0.5 * acceleration.x * u * u;
        const y = position.y + velocity.y * u + 0.5 * acceleration.y * u * u;
        const z = position.z + velocity.z * u + 0.5 * acceleration.z * u * u;
        sampledMinimum = Math.min(sampledMinimum, Math.hypot(x, y, z));
      }

      expect(exact).toBeDefined();
      expect(exact as number).toBeLessThanOrEqual(sampledMinimum + 1e-11);
    }
  });

  it("matches cold anchor intervals after warm outward and inward cache queries", () => {
    const cfg = crossingConfig("warn");

    const positiveOutward = cachedCrossingSample(crossingState(-1, 2), cfg);
    const positiveCold = positiveOutward.sample(2);
    const positiveWarm = cachedCrossingSample(crossingState(-1, 2), cfg);
    positiveWarm.sample(1);
    expect(positiveWarm.sample(2).minimumEncounterDistance).toBe(positiveCold.minimumEncounterDistance);

    const positiveInward = cachedCrossingSample(crossingState(-3, 2), cfg);
    const positiveInwardCold = positiveInward.sample(1);
    const positiveInwardWarm = cachedCrossingSample(crossingState(-3, 2), cfg);
    positiveInwardWarm.sample(2);
    expect(positiveInwardWarm.sample(1).minimumEncounterDistance).toBe(
      positiveInwardCold.minimumEncounterDistance,
    );
    expect(positiveInwardCold.minimumEncounterDistance).toBeGreaterThan(0.1);

    const negativeOutward = cachedCrossingSample(crossingState(1, 2), cfg);
    const negativeCold = negativeOutward.sample(-2);
    const negativeWarm = cachedCrossingSample(crossingState(1, 2), cfg);
    negativeWarm.sample(-1);
    expect(negativeWarm.sample(-2).minimumEncounterDistance).toBe(negativeCold.minimumEncounterDistance);

    const negativeInward = cachedCrossingSample(crossingState(3, 2), cfg);
    const negativeInwardCold = negativeInward.sample(-1);
    const negativeInwardWarm = cachedCrossingSample(crossingState(3, 2), cfg);
    negativeInwardWarm.sample(-2);
    expect(negativeInwardWarm.sample(-1).minimumEncounterDistance).toBe(
      negativeInwardCold.minimumEncounterDistance,
    );
    expect(negativeInwardCold.minimumEncounterDistance).toBeGreaterThan(0.1);
  });

  it("keeps the zero anchor through cross-zero cache population", () => {
    const anchor = crossingState(-1, 2);
    const entries: NBodyCacheEntry[] = [{ t: 0, state: cloneState(anchor) }];
    for (let t = 1; t <= NBODY_CACHE_MAX + 1; t++) {
      storeEntry(entries, { ...cloneState(anchor), t, minimumEncounterDistance: 0 });
    }

    expect(entries.some((entry) => entry.t === 0)).toBe(true);
    expect(findBaseEntryForTarget(entries, -1)?.t).toBe(0);
    expect(findBaseEntryForTarget(entries, NBODY_CACHE_MAX)?.t).toBe(NBODY_CACHE_MAX);
  });
});

function cachedCrossingSample(
  initial: NBodyState,
  cfg: ResolvedNBodyConfig,
): {
  sample: (target: number) => NBodyState;
} {
  const entries: NBodyCacheEntry[] = [{ t: 0, state: cloneState(initial) }];
  return {
    sample(target: number): NBodyState {
      const base = findBaseEntryForTarget(entries, target);
      if (!base) throw new Error("expected a cache base on the canonical anchor interval");
      const state = integrateToTimeWithConfig({ state: base.state, tTarget: target, cfg, maxSteps: 10 });
      storeEntry(entries, state);
      return state;
    },
  };
}

function crossingState(position: number, velocity: number): NBodyState {
  return {
    t: 0,
    rS: { x: 100, y: 0, z: 0 },
    vS: { x: 0, y: 0, z: 0 },
    rP: { x: position, y: 0, z: 0 },
    vP: { x: velocity, y: 0, z: 0 },
    rM: { x: 0, y: 0, z: 0 },
    vM: { x: 0, y: 0, z: 0 },
    perturbers: [],
  };
}

function crossingConfig(onCloseEncounter: "warn" | "abort"): ResolvedNBodyConfig {
  return {
    muStar: 0,
    muPlanet: 0,
    muMoon: 0,
    dtMaxAbs: 1,
    softening: 0.01,
    throwOnOverlap: false,
    perturbers: [],
    relativity: { grOn: false, c: 1 },
    integrator: {
      mode: "fixed-verlet",
      errorTolAbs: 1e-9,
      dtMin: 1e-6,
      growthFactor: 2,
      shrinkFactor: 0.5,
      maxSubsteps: 10,
    },
    collision: { enabled: true, minSeparation: 0.1, onCloseEncounter },
  };
}
