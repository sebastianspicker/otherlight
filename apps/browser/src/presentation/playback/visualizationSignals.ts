/** Connects visualization interactions to simulation and UI update signals. */
//
// Overlay series builders produce LightCurveOverlaySeries data
// from simulation runtimes, band variants, or sample arrays.

import type { SimulationFrame } from "../../domain/simulation/frames";
import type {
  LightCurveComparisonInset,
  LightCurveOverlayPoint,
  LightCurveOverlaySeries,
} from "../render/lightCurve/lightCurvePlotTypes";

const COMPARISON_TIME_EPS_SEC = 1e-9;

type RuntimeLike = {
  step: (tSec: number) => SimulationFrame;
};

export function componentOverlaySeriesFromSamples(
  samples: Array<{ t: number; step: SimulationFrame }>,
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
  fluxSelector: (step: SimulationFrame) => number,
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
