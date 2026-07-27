/** Covers baseline capture data and helpers used by physics baseline regression checks. */

import { beforeEach, describe, expect, it } from "vitest";
import { performance } from "node:perf_hooks";

import type { SystemParams } from "../../src/core/types";
import { PRESETS } from "../../src/app/presets";
import { stepSystem } from "../../src/sim/sim";
import { computeBodyKinematics } from "../../src/sim/kinematics";
import { getObserverDir } from "../../src/sim/observerContract";
import { resetNBodyCache } from "../../src/sim/dynamics";
import { nbodyEnergyForPreset } from "./baselineEnergy";

beforeEach(() => {
  resetNBodyCache();
});

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

function finiteFluxTransitFactor(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 1;
}

function samplePreset(params: SystemParams, presetId: string, tSec: number): BaselineSample {
  const step = stepSystem(params, tSec);
  const observerDir = getObserverDir(params);
  const kin = computeBodyKinematics(params, tSec, observerDir);

  return {
    presetId,
    tSec,
    fluxTotal: step.fluxTotal,
    fluxTransitFactor: finiteFluxTransitFactor(step.fluxTransitFactor),
    planetSky: { x: kin.planetSky.x, y: kin.planetSky.y, z: kin.planetSky.z, r: params.planet.r },
    moonSky: kin.moonSky
      ? { x: kin.moonSky.x, y: kin.moonSky.y, z: kin.moonSky.z, r: params.moon!.r }
      : undefined,
    rBary: kin.rBary,
    rPlanetAbs: kin.rPlanetAbs,
    rMoonAbs: kin.rMoonAbs,
    nbodyEnergy: nbodyEnergyForPreset(params, tSec),
  };
}

function baselinePresetIds(): string[] {
  return ["default", "kepler-planet-only", "nbody-with-perturber"];
}

function presetPeriodSeconds(params: SystemParams): number {
  return typeof params.planet.orbit === "function" ? 10_000 : (params.planet.orbit?.period ?? 10_000);
}

function collectBaselineSamples(): BaselineSample[] {
  const outputs: BaselineSample[] = [];
  for (const id of baselinePresetIds()) {
    const preset = PRESETS.find((p) => p.id === id);
    if (!preset) continue;
    const period = presetPeriodSeconds(preset.params);
    for (const t of [0, period / 4, period / 2]) {
      outputs.push(samplePreset(preset.params, id, t));
    }
  }
  return outputs;
}

function expectFiniteBaselineSamples(outputs: BaselineSample[]): void {
  for (const out of outputs) {
    expect(Number.isFinite(out.fluxTotal)).toBe(true);
    expect(Number.isFinite(out.fluxTransitFactor)).toBe(true);
  }
}

function maybeLogBaselineSnapshots(outputs: BaselineSample[]): void {
  if (process.env.BASELINE_CAPTURE !== "1") return;
  console.log("BASELINE_SNAPSHOTS_START");
  console.log(JSON.stringify(outputs, null, 2));
  console.log("BASELINE_SNAPSHOTS_END");
}

describe("baseline capture (numeric logs + perf)", () => {
  it("logs baseline snapshots for key presets", () => {
    const outputs = collectBaselineSamples();
    expectFiniteBaselineSamples(outputs);
    maybeLogBaselineSnapshots(outputs);
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
