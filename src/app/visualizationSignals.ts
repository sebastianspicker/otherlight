// src/app/visualizationSignals.ts
//
// Overlay series builders — functions that produce LightCurveOverlaySeries data
// from simulation runtimes, band variants, or sample arrays.

import { cloneParams } from "../core/clone";
import type { SystemParams } from "../core/types";
import { resolveWeightedPhotometryBands } from "../sim/v4/nativePhotometry";
import { createSimulationV4, migrateSystemParamsToV4 } from "../sim/v4";
import type { SimulationStepV3 } from "../sim/v3/types";
import type {
  LightCurveComparisonInset,
  LightCurveOverlayPoint,
  LightCurveOverlaySeries,
} from "../render/lightCurvePlotTypes";

const BAND_COLORS = ["#ffb703", "#8ecae6", "#fb8500", "#90be6d", "#f28482"];
const COMPARISON_TIME_EPS_SEC = 1e-9;

type RuntimeLike = {
  step: (tSec: number) => SimulationStepV3;
};

type BandVariantSystem = {
  label: string;
  color: string;
  system: SystemParams;
};

type WeightedPhotometryBand = ReturnType<typeof resolveWeightedPhotometryBands>[number];

export function componentOverlaySeriesFromSamples(
  samples: Array<{ t: number; step: SimulationStepV3 }>,
): LightCurveOverlaySeries[] {
  const baseline: LightCurveOverlaySeries = {
    id: "stellar-baseline",
    label: "stellar baseline",
    color: "#6c757d",
    style: "dashed",
    alpha: 0.65,
    samples: [],
  };
  const transitOnly: LightCurveOverlaySeries = {
    id: "transit-only",
    label: "transit attenuation",
    color: "#8ecae6",
    style: "dotted",
    alpha: 0.78,
    samples: [],
  };
  const scatterShoulder: LightCurveOverlaySeries = {
    id: "scattering-shoulder",
    label: "scatter/refraction shoulder",
    color: "#ffb703",
    style: "solid",
    alpha: 0.82,
    samples: [],
  };
  for (const sample of samples) {
    const c = sample.step.renderSignals.fluxComponents;
    baseline.samples.push({ t: sample.t, flux: c.stellarPreTransit });
    transitOnly.samples.push({ t: sample.t, flux: c.stellarPreTransit * c.transitFactor });
    scatterShoulder.samples.push({
      t: sample.t,
      flux:
        c.stellarPreTransit * c.transitFactor +
        c.forwardScattering +
        c.ringScattering +
        (Number.isFinite(c.refraction) ? (c.refraction as number) : 0),
    });
  }
  return [baseline, transitOnly, scatterShoulder];
}

export function buildBandVariantSystems(system: SystemParams): BandVariantSystem[] {
  const cfg = migrateSystemParamsToV4(system);
  const bands = resolveWeightedPhotometryBands(cfg);
  if (bands.length <= 1) return [];

  return bands.map((band, index) => buildBandVariantSystem(system, band, index));
}

function buildBandVariantSystem(
  system: SystemParams,
  band: WeightedPhotometryBand,
  index: number,
): BandVariantSystem {
  const clone = cloneParams(system);
  applySingleSpectralBand(clone, band.lambdaNm);
  applySingleTransmissionBand(clone, band.lambdaNm, index);
  return {
    label: `${Math.round(band.lambdaNm)} nm`,
    color: BAND_COLORS[index % BAND_COLORS.length],
    system: clone,
  };
}

function applySingleSpectralBand(system: SystemParams, lambdaNm: number): void {
  const bandpass = system.star.photometry?.spectralBandpass;
  if (!bandpass?.enabled || !Array.isArray(bandpass.lambdaNm)) return;

  bandpass.lambdaNm = [lambdaNm];
  bandpass.weights = [1];
}

function applySingleTransmissionBand(system: SystemParams, lambdaNm: number, fallbackIndex: number): void {
  const transmission = system.star.photometry?.atmosphereTransmission;
  if (!transmission?.enabled || !Array.isArray(transmission.lambdaNm)) return;

  const pickIndex = pickTransmissionBandIndex(transmission.lambdaNm, lambdaNm, fallbackIndex);
  const pickedLambda = transmission.lambdaNm[pickIndex];
  const tauScale = Array.isArray(transmission.tauScale) ? transmission.tauScale[pickIndex] : undefined;
  if (Number.isFinite(pickedLambda)) transmission.lambdaNm = [pickedLambda as number];
  if (Number.isFinite(tauScale)) transmission.tauScale = [tauScale as number];
}

function pickTransmissionBandIndex(lambdaNmList: number[], lambdaNm: number, fallbackIndex: number): number {
  const matchingIndex = lambdaNmList.findIndex((value) => value === lambdaNm);
  return matchingIndex >= 0 ? matchingIndex : fallbackIndex;
}

export function sampleBandOverlaySeries(args: {
  variants: Array<{ label: string; color: string; system: SystemParams }>;
  times: number[];
}): LightCurveOverlaySeries[] {
  const series: LightCurveOverlaySeries[] = [];
  for (const [index, variant] of args.variants.entries()) {
    const runtime = createSimulationV4(migrateSystemParamsToV4(variant.system));
    const samples: LightCurveOverlayPoint[] = [];
    for (const t of args.times) {
      const step = runtime.step(t);
      const flux = Number.isFinite(step.debug?.displayFluxValue)
        ? (step.debug?.displayFluxValue as number)
        : step.flux.total;
      samples.push({ t, flux });
    }
    series.push({
      id: `band-${index}`,
      label: variant.label,
      color: variant.color,
      style: "solid",
      width: 1.15,
      alpha: 0.75,
      samples,
    });
  }
  return series;
}

export function buildComparisonInset(args: {
  a: LightCurveOverlaySeries | undefined;
  b: LightCurveOverlaySeries | undefined;
}): LightCurveComparisonInset | undefined {
  const { a, b } = args;
  if (!hasComparisonSamples(a) || !hasComparisonSamples(b)) return undefined;

  return comparisonInsetFromDeltaSamples(buildComparisonDeltaSamples(a, b));
}

function hasComparisonSamples(
  series: LightCurveOverlaySeries | undefined,
): series is LightCurveOverlaySeries {
  return Boolean(series && series.samples.length > 0);
}

function buildComparisonDeltaSamples(
  a: LightCurveOverlaySeries,
  b: LightCurveOverlaySeries,
): LightCurveOverlayPoint[] {
  const deltaSamples: LightCurveOverlayPoint[] = [];
  const count = Math.min(a.samples.length, b.samples.length);
  for (let i = 0; i < count; i++) {
    const deltaSample = buildComparisonDeltaSample(a.samples[i], b.samples[i]);
    if (deltaSample) deltaSamples.push(deltaSample);
  }
  return deltaSamples;
}

function buildComparisonDeltaSample(
  sampleA: LightCurveOverlayPoint,
  sampleB: LightCurveOverlayPoint,
): LightCurveOverlayPoint | undefined {
  if (!hasAlignedFiniteSamples(sampleA, sampleB)) return undefined;

  return { t: sampleA.t, flux: sampleB.flux - sampleA.flux };
}

function hasAlignedFiniteSamples(sampleA: LightCurveOverlayPoint, sampleB: LightCurveOverlayPoint): boolean {
  return (
    Number.isFinite(sampleA.t) &&
    Number.isFinite(sampleB.t) &&
    Math.abs(sampleA.t - sampleB.t) <= COMPARISON_TIME_EPS_SEC &&
    Number.isFinite(sampleA.flux) &&
    Number.isFinite(sampleB.flux)
  );
}

function comparisonInsetFromDeltaSamples(
  deltaSamples: LightCurveOverlayPoint[],
): LightCurveComparisonInset | undefined {
  if (deltaSamples.length === 0) return undefined;
  return {
    title: "A/B delta",
    series: [{ label: "B-A", color: "#ffb703", samples: deltaSamples }],
  };
}

export function sampleSeriesFromRuntime(
  runtime: RuntimeLike,
  times: number[],
  label: string,
  color: string,
  fluxSelector: (step: SimulationStepV3) => number,
  style: LightCurveOverlaySeries["style"] = "solid",
): LightCurveOverlaySeries {
  return {
    id: label.toLowerCase().replace(/\s+/g, "-"),
    label,
    color,
    style,
    samples: times.map((t) => {
      const step = runtime.step(t);
      return { t, flux: fluxSelector(step) };
    }),
  };
}
