import { beforeAll, describe, expect, it } from "vitest";
import { performance } from "node:perf_hooks";

import type { SystemParams } from "../../src/core/types";
import { getPresetById } from "../../src/app/presets";
import { computeBodyKinematics } from "../../src/sim/kinematics";
import { getObserverDir } from "../../src/sim/observerContract";
import { stepSystem } from "../../src/sim/sim";
import { setDidacticsHook } from "../../src/sim/didacticsHook";
import { computeDidacticSignals } from "../../src/didactics/engine";

beforeAll(() => {
  setDidacticsHook(computeDidacticSignals);
});

function findMoonTransitCenterSec(params: SystemParams): number {
  const observerDir = getObserverDir(params);
  const orbit = params.planet.orbit;
  if (!("period" in orbit)) {
    throw new Error("findMoonTransitCenterSec: planet orbit provider is not supported in this perf helper.");
  }
  const periodSec = orbit.period;
  const samples = 8000;
  let bestSec = 0;
  let bestImpact = Number.POSITIVE_INFINITY;

  for (let idx = 0; idx <= samples; idx++) {
    const tSec = (periodSec * idx) / samples;
    const kin = computeBodyKinematics(params, tSec, observerDir);
    if (!kin.moonSky || !(kin.moonSky.z > 0)) continue;
    const impact = Math.hypot(kin.moonSky.x, kin.moonSky.y);
    if (impact < bestImpact) {
      bestImpact = impact;
      bestSec = tSec;
    }
  }

  return bestSec;
}

describe("perf scenarios", () => {
  it("steps kepler-planet-only preset within budget", () => {
    const preset = getPresetById("kepler-planet-only");
    const system = preset.params;
    const n = 800;
    let t = 0;
    const dt = 5;

    const t0 = performance.now();
    for (let i = 0; i < n; i++) {
      t += dt;
      stepSystem(system, t);
    }
    const t1 = performance.now();

    const msPerStep = (t1 - t0) / n;
    expect(Number.isFinite(msPerStep)).toBe(true);
    expect(msPerStep).toBeLessThan(50);
  });

  it("steps nbody-with-perturber preset within budget", () => {
    const preset = getPresetById("nbody-with-perturber");
    const system = preset.params;
    const n = 800;
    let t = 0;
    const dt = 5;

    const t0 = performance.now();
    for (let i = 0; i < n; i++) {
      t += dt;
      stepSystem(system, t);
    }
    const t1 = performance.now();

    const msPerStep = (t1 - t0) / n;
    expect(Number.isFinite(msPerStep)).toBe(true);
    expect(msPerStep).toBeLessThan(50);
  });

  it("steps accelerated scientific exact-contact moon timing within budget", () => {
    const system: SystemParams = {
      observer: { dir: { x: 0, y: 0, z: 1 } },
      star: {
        r: 1,
        m: 1,
        photometry: { baselineFlux: 1, gridRes: 300, additiveComposition: "higher-fidelity-coupled" },
      },
      dynamics: {
        fidelityProfile: "accurate",
        exomoonTimingShape: {
          enabled: true,
          tRef: 0,
          velDt: 50,
          moonOmegaDot: 5e-4,
        },
      },
      planet: {
        r: 0.09,
        m: 1e-3,
        orbit: {
          a: 5,
          e: 0.2,
          inc: Math.PI / 2,
          Omega: 0,
          omega: 0.2,
          period: 1000,
          t0: 0,
        },
      },
      moon: {
        r: 0.03,
        m: 1e-5,
        orbitAroundPlanet: {
          a: 0.55,
          e: 0.05,
          inc: 0.03,
          Omega: 0.15,
          omega: 0.4,
          period: 180,
          t0: 0,
        },
      },
    };

    const centerSec = findMoonTransitCenterSec(system);
    const n = 240;
    const dt = 0.25;
    let t = centerSec - (n * dt) / 2;

    const t0 = performance.now();
    for (let i = 0; i < n; i++) {
      t += dt;
      stepSystem(system, t);
    }
    const t1 = performance.now();

    const msPerStep = (t1 - t0) / n;
    expect(Number.isFinite(msPerStep)).toBe(true);
    expect(msPerStep).toBeLessThan(50);
  }, 30_000);
});
