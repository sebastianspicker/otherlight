/** Verifies v4 atmosphere effects contracts across system state, transit observables, and V4 integration. */

import { expect, it } from "vitest";

import { cloneParams, SCENARIO_DEFAULTS } from "../../src/app/scenario";
import { migrateSystemParamsToV4 } from "../../src/sim/v4";
import { createSimulationV4 } from "../../src/sim/v4/runtime";

function findExtremeSample(args: {
  periodSec: number;
  metric: (step: ReturnType<ReturnType<typeof createSimulationV4>["step"]>) => number;
  mode: "min" | "max";
  stepAt: (tSec: number) => ReturnType<ReturnType<typeof createSimulationV4>["step"]>;
}): { tSec: number; value: number } {
  const samples = 1200;
  let bestT = 0;
  let bestValue = args.mode === "min" ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;

  for (let index = 0; index <= samples; index++) {
    const tSec = (args.periodSec * index) / samples;
    const value = args.metric(args.stepAt(tSec));
    if (!Number.isFinite(value)) continue;
    if ((args.mode === "min" && value < bestValue) || (args.mode === "max" && value > bestValue)) {
      bestValue = value;
      bestT = tSec;
    }
  }

  return { tSec: bestT, value: bestValue };
}

it("legacy atmosphereTransmission changes the native V4 transit depth", async () => {
  const base = cloneParams(SCENARIO_DEFAULTS);
  delete base.moon;
  base.planet.orbit = {
    a: 1.2e10,
    e: 0,
    inc: Math.PI / 2,
    Omega: 0,
    omega: 0,
    period: 3.2e5,
    t0: 0,
  };
  base.star.photometry = {
    ...base.star.photometry,
    atmosphereTransmission: undefined,
    atmosphereRT: undefined,
    phaseCurve: undefined,
    moonPhaseCurve: undefined,
    forwardScattering: undefined,
    ringScattering: undefined,
    stellarVariability: undefined,
    spectralBandpass: undefined,
  };

  const halo = cloneParams(base);
  halo.star.photometry = {
    ...halo.star.photometry,
    atmosphereTransmission: {
      enabled: true,
      target: "planet",
      kind: "exponential-halo",
      r0: halo.planet.r,
      H: 1.8e7,
      tau0: 0.9,
    },
  };

  const baseRuntime = createSimulationV4(migrateSystemParamsToV4(base));
  const haloRuntime = createSimulationV4(migrateSystemParamsToV4(halo));
  await baseRuntime.prepare();
  await haloRuntime.prepare();

  const center = findExtremeSample({
    periodSec: base.planet.orbit.period,
    metric: (step) => step.flux.transitFactor,
    mode: "min",
    stepAt: (tSec) => baseRuntime.step(tSec),
  });
  const baseStep = baseRuntime.step(center.tSec);
  const haloStep = haloRuntime.step(center.tSec);

  expect(Math.abs(haloStep.flux.transitFactor - baseStep.flux.transitFactor)).toBeGreaterThan(1e-5);
});

// These dense spectral scans remain bounded but cross Vitest's 5 s default
// under V8 coverage instrumentation on slower runners.
it("band weighting changes the V4 atmosphereRT transit signal when molecular features are present", async () => {
  const featureWeighted = cloneParams(SCENARIO_DEFAULTS);
  delete featureWeighted.moon;
  featureWeighted.planet.orbit = {
    a: 1.2e10,
    e: 0,
    inc: Math.PI / 2,
    Omega: 0,
    omega: 0,
    period: 3.2e5,
    t0: 0,
  };
  featureWeighted.star.photometry = {
    ...featureWeighted.star.photometry,
    phaseCurve: undefined,
    moonPhaseCurve: undefined,
    forwardScattering: undefined,
    ringScattering: undefined,
    stellarVariability: undefined,
    atmosphereTransmission: undefined,
    spectralBandpass: {
      enabled: true,
      lambdaNm: [500, 589, 760],
      weights: [0.2, 0.7, 0.1],
    },
    atmosphereRT: {
      enabled: true,
      target: "planet",
      lambdaRefNm: 589,
      layers: [{ r0: featureWeighted.planet.r, H: 1.5e7, tau0: 0.8, alpha: 0.25 }],
      molecularFeatures: {
        enabled: true,
        centerNm: [589],
        widthNm: [12],
        strength: [1.8],
      },
    },
  };

  const continuumWeighted = cloneParams(featureWeighted);
  continuumWeighted.star.photometry = {
    ...continuumWeighted.star.photometry,
    spectralBandpass: {
      enabled: true,
      lambdaNm: [500, 589, 760],
      weights: [0.1, 0.1, 0.8],
    },
  };

  const featureRuntime = createSimulationV4(migrateSystemParamsToV4(featureWeighted));
  const continuumRuntime = createSimulationV4(migrateSystemParamsToV4(continuumWeighted));
  await featureRuntime.prepare();
  await continuumRuntime.prepare();

  const center = findExtremeSample({
    periodSec: featureWeighted.planet.orbit.period,
    metric: (step) => step.flux.transitFactor,
    mode: "min",
    stepAt: (tSec) => featureRuntime.step(tSec),
  });
  const featureStep = featureRuntime.step(center.tSec);
  const continuumStep = continuumRuntime.step(center.tSec);

  expect(Math.abs(featureStep.flux.transitFactor - continuumStep.flux.transitFactor)).toBeGreaterThan(1e-5);
}, 30_000);

it("adds the configured atmosphereRT refraction term into the V4 plotted total flux", async () => {
  const refractive = cloneParams(SCENARIO_DEFAULTS);
  delete refractive.moon;
  refractive.planet.orbit = {
    a: 1.2e10,
    e: 0,
    inc: Math.PI / 2,
    Omega: 0,
    omega: 0,
    period: 3.2e5,
    t0: 0,
  };
  refractive.star.photometry = {
    ...refractive.star.photometry,
    phaseCurve: undefined,
    moonPhaseCurve: undefined,
    forwardScattering: undefined,
    ringScattering: undefined,
    stellarVariability: undefined,
    atmosphereTransmission: undefined,
    spectralBandpass: {
      enabled: true,
      lambdaNm: [450, 550, 750],
      weights: [0.25, 0.5, 0.25],
    },
    atmosphereRT: {
      enabled: true,
      target: "planet",
      lambdaRefNm: 550,
      layers: [{ r0: refractive.planet.r, H: 1.2e7, tau0: 0.35 }],
      refraction: {
        enabled: true,
        amp: 0.0016,
        width: 4.5e7,
        chromaticSlope: 0.6,
      },
    },
  };

  const baseline = cloneParams(refractive);
  baseline.star.photometry = {
    ...baseline.star.photometry,
    atmosphereRT: {
      ...baseline.star.photometry!.atmosphereRT!,
      refraction: { ...baseline.star.photometry!.atmosphereRT!.refraction!, enabled: false },
    },
  };

  const refractiveRuntime = createSimulationV4(migrateSystemParamsToV4(refractive));
  const baselineRuntime = createSimulationV4(migrateSystemParamsToV4(baseline));
  await refractiveRuntime.prepare();
  await baselineRuntime.prepare();

  const peak = findExtremeSample({
    periodSec: refractive.planet.orbit.period,
    metric: (step) => step.flux.refraction ?? 0,
    mode: "max",
    stepAt: (tSec) => refractiveRuntime.step(tSec),
  });
  const refractiveStep = refractiveRuntime.step(peak.tSec);
  const baselineStep = baselineRuntime.step(peak.tSec);

  expect(refractiveStep.flux.refraction).toBeGreaterThan(0);
  expect(refractiveStep.flux.decomposition?.refraction).toBe(refractiveStep.flux.refraction);
  expect(refractiveStep.flux.total).toBeGreaterThan(baselineStep.flux.total);
}, 30_000);
