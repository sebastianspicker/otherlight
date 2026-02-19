import { describe, expect, it } from "vitest";
import { performance } from "node:perf_hooks";

import type { SystemParams } from "../../src/core/types";
import { PRESETS } from "../../src/app/presets";
import { stepSystem } from "../../src/sim/sim";
import { computeBodyKinematics } from "../../src/sim/kinematics";
import { getObserverDir } from "../../src/sim/observerContract";
import { getNBodyStateAt } from "../../src/sim/dynamics";
import { G_SI } from "../../src/core/units";
import { resolveEnabledNBodyPlanetMoonConfig } from "../../src/sim/nbody/config";
import { vLenSq, vSub } from "../../src/physics/vec3";

type BaselineSample = {
  presetId: string;
  tSec: number;
  fluxTotal: number;
  fluxTransitFactor: number;
  planetSky: { x: number; y: number; z: number; r: number };
  moonSky?: { x: number; y: number; z: number; r: number };
  rBary: { x: number; y: number; z: number };
  rPlanetAbs: { x: number; y: number; z: number };
  rMoonAbs?: { x: number; y: number; z: number };
  nbodyEnergy?: number;
};

function totalEnergyFromMu(params: { state: any; mus: number[]; G?: number }): number {
  const { state, mus } = params;
  const G = typeof params.G === "number" && Number.isFinite(params.G) && params.G > 0 ? params.G : 1;
  const positions = [state.rS, state.rP, state.rM, ...(state.perturbers ?? []).map((p: any) => p.r)];
  const velocities = [state.vS, state.vP, state.vM, ...(state.perturbers ?? []).map((p: any) => p.v)];

  if (positions.length !== mus.length || velocities.length !== mus.length) {
    throw new Error("baseline energy helper: body count mismatch");
  }

  let T = 0;
  for (let i = 0; i < mus.length; i++) {
    const m = mus[i] / G;
    T += 0.5 * m * vLenSq(velocities[i]);
  }

  let U = 0;
  for (let i = 0; i < mus.length; i++) {
    for (let j = i + 1; j < mus.length; j++) {
      const dr = vSub(positions[j], positions[i]);
      const r = Math.sqrt(vLenSq(dr));
      U += -(mus[i] * mus[j]) / (G * r);
    }
  }

  return T + U;
}

function samplePreset(params: SystemParams, presetId: string, tSec: number): BaselineSample {
  const step = stepSystem(params, tSec);
  const observerDir = getObserverDir(params);
  const kin = computeBodyKinematics(params, tSec, observerDir);
  const fluxTransitFactorRaw = step.fluxTransitFactor;
  const fluxTransitFactor =
    typeof fluxTransitFactorRaw === "number" && Number.isFinite(fluxTransitFactorRaw)
      ? fluxTransitFactorRaw
      : 1;

  let nbodyEnergy: number | undefined;
  const nbody = params.dynamics?.nbodyPlanetMoon;
  if (nbody?.enabled) {
    const nb = getNBodyStateAt(params, tSec);
    if (nb) {
      const resolved = resolveEnabledNBodyPlanetMoonConfig(nbody, {
        onInvalid: "disable",
        masses: { star: params.star?.m, planet: params.planet?.m, moon: params.moon?.m },
        G: G_SI,
      });
      if (resolved) {
        const pertMus: number[] = [];
        const perturbers = Array.isArray(nbody.perturbers) ? nbody.perturbers : [];
        for (const p of perturbers) {
          if (!p || p.enabled === false) continue;
          if (typeof p.mu === "number" && Number.isFinite(p.mu) && p.mu > 0) {
            pertMus.push(p.mu);
            continue;
          }
          if (typeof p.m === "number" && Number.isFinite(p.m) && p.m > 0) {
            pertMus.push(G_SI * p.m);
          }
        }
        const mus = [resolved.muStar, resolved.muPlanet, resolved.muMoon, ...pertMus];
        nbodyEnergy = totalEnergyFromMu({ state: nb.state, mus, G: G_SI });
      }
    }
  }

  return {
    presetId,
    tSec,
    fluxTotal: step.fluxTotal,
    fluxTransitFactor,
    planetSky: { x: kin.planetSky.x, y: kin.planetSky.y, z: kin.planetSky.z, r: params.planet.r },
    moonSky: kin.moonSky
      ? { x: kin.moonSky.x, y: kin.moonSky.y, z: kin.moonSky.z, r: params.moon!.r }
      : undefined,
    rBary: kin.rBary,
    rPlanetAbs: kin.rPlanetAbs,
    rMoonAbs: kin.rMoonAbs,
    nbodyEnergy,
  };
}

describe("baseline capture (numeric logs + perf)", () => {
  it("logs baseline snapshots for key presets", () => {
    const presetIds = ["default", "kepler-planet-only", "nbody-with-perturber"];

    const outputs: BaselineSample[] = [];

    for (const id of presetIds) {
      const preset = PRESETS.find((p) => p.id === id);
      if (!preset) continue;

      const params = preset.params;
      const period =
        typeof params.planet.orbit === "function" ? 10_000 : (params.planet.orbit?.period ?? 10_000);

      const times = [0, period / 4, period / 2];
      for (const t of times) {
        outputs.push(samplePreset(params, id, t));
      }
    }

    for (const out of outputs) {
      expect(Number.isFinite(out.fluxTotal)).toBe(true);
      expect(Number.isFinite(out.fluxTransitFactor)).toBe(true);
    }

    if (process.env.BASELINE_CAPTURE === "1") {
      console.log("BASELINE_SNAPSHOTS_START");
      console.log(JSON.stringify(outputs, null, 2));
      console.log("BASELINE_SNAPSHOTS_END");
    }
  });

  it("logs stepSystem performance (ms/step)", () => {
    const preset = PRESETS.find((p) => p.id === "default") ?? PRESETS[0];
    const params = preset.params;

    const steps = 2000;
    let t = 0;
    const dt = 1;

    // Warm up
    for (let i = 0; i < 200; i++) {
      t += dt;
      stepSystem(params, t);
    }

    const t0 = performance.now();
    for (let i = 0; i < steps; i++) {
      t += dt;
      stepSystem(params, t);
    }
    const t1 = performance.now();

    const msPerStep = (t1 - t0) / steps;
    if (process.env.BASELINE_CAPTURE === "1") {
      console.log("BASELINE_PERF_MS_PER_STEP", msPerStep.toFixed(6));
    }

    expect(msPerStep).toBeGreaterThan(0);
  });
});
