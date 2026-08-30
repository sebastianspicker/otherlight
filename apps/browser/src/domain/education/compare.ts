/**
 * Owns compare support within the didactics layer. Keeps learning-flow behavior independent of simulation execution.
 */
import type { BrowserScenarioDraft } from "../model/types";
import { createSimulationV4, mapBrowserScenarioDraftToEducationScenarioV4 } from "../simulation/v4";
import { displayFluxValueForConfig } from "../simulation/v4/binaryBaseline";
import type { SimulationFrame } from "../simulation/frames";
import { appendScalarDeltas, dynamicsNote, interpretationLine } from "./compareText";

type ComparisonCurvePoint = {
  t: number;
  flux: number;
};

type ComparisonCurveSeries = {
  id: string;
  label: string;
  color: string;
  style?: "solid" | "dashed" | "dotted";
  alpha?: number;
  width?: number;
  includeInLegend?: boolean;
  samples: ComparisonCurvePoint[];
};

type ComparisonInsetSeries = {
  label: string;
  color: string;
  samples: ComparisonCurvePoint[];
};

type ComparisonInset = {
  title: string;
  series: ComparisonInsetSeries[];
};

type ComparisonBadge = {
  label: string;
  color: string;
};

type ComparisonGhostGeometry = {
  label: string;
  color?: string;
  geometry: SimulationFrame["renderSignals"]["occulterGeometry"];
};

type SimulationRuntimeV4 = ReturnType<typeof createSimulationV4>;

/**
 * A/B scenario comparison result computed at a single simulation time `tSec`.
 * Captures scalar flux and RV deltas, plus optional visual overlays for the lesson UI.
 */
export type DidacticComparison = {
  tSec: number;
  fluxTotalDelta: number;
  fluxDisplayDelta?: number;
  fluxTransitDelta: number;
  rvStarDelta?: number;
  rvPlanetDelta?: number;
  visual?: {
    curveSeries: ComparisonCurveSeries[];
    comparisonInset?: ComparisonInset;
    sceneGhosts: ComparisonGhostGeometry[];
    badges: ComparisonBadge[];
  };
};

function deriveComparisonWindow(
  stepA: SimulationFrame,
  stepB: SimulationFrame,
): { startSec: number; endSec: number } {
  const durationSec = Math.max(...durationCandidates(stepA, stepB), 1800);
  const extentSec = Math.max(...extentCandidates(stepA, stepB));
  const halfWindowSec = Math.max(3600, durationSec * 3, extentSec + durationSec);
  return { startSec: -halfWindowSec, endSec: halfWindowSec };
}

function absTimingValue(value: number | undefined): number {
  return Math.abs(value ?? 0);
}

function durationCandidates(stepA: SimulationFrame, stepB: SimulationFrame): number[] {
  return [
    absTimingValue(stepA.timing?.planetTransitDurationSec),
    absTimingValue(stepB.timing?.planetTransitDurationSec),
    absTimingValue(stepA.timing?.moonTransitDurationSec),
    absTimingValue(stepB.timing?.moonTransitDurationSec),
  ];
}

function extentCandidates(stepA: SimulationFrame, stepB: SimulationFrame): number[] {
  return [
    absTimingValue(stepA.timing?.planetIngressSec),
    absTimingValue(stepA.timing?.planetEgressSec),
    absTimingValue(stepA.timing?.moonIngressSec),
    absTimingValue(stepA.timing?.moonEgressSec),
    absTimingValue(stepB.timing?.planetIngressSec),
    absTimingValue(stepB.timing?.planetEgressSec),
    absTimingValue(stepB.timing?.moonIngressSec),
    absTimingValue(stepB.timing?.moonEgressSec),
  ];
}

function createGhost(label: string, step: SimulationFrame, color: string): ComparisonGhostGeometry {
  return {
    label,
    color,
    geometry: step.renderSignals.occulterGeometry.map((item) => ({ ...item })),
  };
}

function buildComparisonInset(
  aSamples: ComparisonCurvePoint[],
  bSamples: ComparisonCurvePoint[],
): ComparisonInset {
  const deltaSamples: ComparisonCurvePoint[] = [];
  const count = Math.min(aSamples.length, bSamples.length);
  for (let i = 0; i < count; i++) {
    deltaSamples.push({ t: aSamples[i].t, flux: bSamples[i].flux - aSamples[i].flux });
  }
  return {
    title: "A/B delta",
    series: [{ label: "B-A", color: "#ffb703", samples: deltaSamples }],
  };
}

function displayFluxForStep(step: SimulationFrame): number {
  return Number.isFinite(step.debug?.displayFluxValue)
    ? (step.debug?.displayFluxValue as number)
    : step.flux.total;
}

function sampleComparisonCurves(
  runtimeA: SimulationRuntimeV4,
  runtimeB: SimulationRuntimeV4,
  startSec: number,
  endSec: number,
): { aSamples: ComparisonCurvePoint[]; bSamples: ComparisonCurvePoint[] } {
  const sampleCount: number = 96;
  const aSamples: ComparisonCurvePoint[] = [];
  const bSamples: ComparisonCurvePoint[] = [];

  for (let i = 0; i < sampleCount; i++) {
    const frac = sampleCount === 1 ? 0 : i / (sampleCount - 1);
    const tSample = startSec + frac * (endSec - startSec);
    aSamples.push({ t: tSample, flux: displayFluxForStep(runtimeA.step(tSample)) });
    bSamples.push({ t: tSample, flux: displayFluxForStep(runtimeB.step(tSample)) });
  }

  return { aSamples, bSamples };
}

function comparisonCurveSeries(
  aSamples: ComparisonCurvePoint[],
  bSamples: ComparisonCurvePoint[],
): ComparisonCurveSeries[] {
  return [
    {
      id: "compare-a",
      label: "scenario A",
      color: "#8ecae6",
      style: "solid",
      alpha: 0.85,
      samples: aSamples,
    },
    {
      id: "compare-b",
      label: "scenario B",
      color: "#f28482",
      style: "dashed",
      alpha: 0.9,
      samples: bSamples,
    },
  ];
}

function comparisonBadges(tSec: number, displayDelta: number): ComparisonBadge[] {
  return [
    { label: `compare @ ${tSec.toFixed(0)} s`, color: "#ffb703" },
    { label: `Δdisplay ${displayDelta.toExponential(1)}`, color: "#f4a261" },
  ];
}

function buildComparisonVisual(args: {
  tSec: number;
  displayDelta: number;
  sa: SimulationFrame;
  sb: SimulationFrame;
  aSamples: ComparisonCurvePoint[];
  bSamples: ComparisonCurvePoint[];
}): DidacticComparison["visual"] {
  return {
    curveSeries: comparisonCurveSeries(args.aSamples, args.bSamples),
    comparisonInset: buildComparisonInset(args.aSamples, args.bSamples),
    sceneGhosts: [
      createGhost("scenario A", args.sa, "rgba(142, 202, 230, 0.45)"),
      createGhost("scenario B", args.sb, "rgba(242, 132, 130, 0.42)"),
    ],
    badges: comparisonBadges(args.tSec, args.displayDelta),
  };
}

function finiteOrZero(value: number | undefined): number {
  return value ?? 0;
}

function fluxTransitDelta(sa: SimulationFrame, sb: SimulationFrame): number {
  return finiteOrZero(sb.flux.transitFactor) - finiteOrZero(sa.flux.transitFactor);
}

function rvStarDelta(sa: SimulationFrame, sb: SimulationFrame): number {
  return finiteOrZero(sb.observables?.rvStar) - finiteOrZero(sa.observables?.rvStar);
}

function rvPlanetDelta(sa: SimulationFrame, sb: SimulationFrame): number {
  return finiteOrZero(sb.observables?.rvPlanet) - finiteOrZero(sa.observables?.rvPlanet);
}

function comparisonFluxDisplayDelta(args: {
  configA: ReturnType<typeof mapBrowserScenarioDraftToEducationScenarioV4>;
  configB: ReturnType<typeof mapBrowserScenarioDraftToEducationScenarioV4>;
  sa: SimulationFrame;
  sb: SimulationFrame;
}): number {
  return (
    displayFluxValueForConfig(args.configB, args.sb.flux.total) -
    displayFluxValueForConfig(args.configA, args.sa.flux.total)
  );
}

/**
 * Run both scenarios at `tSec`, sample a comparison window centred on any transits,
 * and return a {@link DidacticComparison} with scalar deltas, curve series, and scene ghosts.
 */
export function compareScenariosAtTime(
  a: BrowserScenarioDraft,
  b: BrowserScenarioDraft,
  tSec: number,
): DidacticComparison {
  const configA = mapBrowserScenarioDraftToEducationScenarioV4(a);
  const configB = mapBrowserScenarioDraftToEducationScenarioV4(b);
  const runtimeA = createSimulationV4(configA);
  const runtimeB = createSimulationV4(configB);
  const sa = runtimeA.step(tSec);
  const sb = runtimeB.step(tSec);
  const { startSec, endSec } = deriveComparisonWindow(sa, sb);
  const { aSamples, bSamples } = sampleComparisonCurves(runtimeA, runtimeB, startSec, endSec);
  const fluxDisplayDelta = comparisonFluxDisplayDelta({ configA, configB, sa, sb });

  return {
    tSec,
    fluxTotalDelta: sb.flux.total - sa.flux.total,
    fluxDisplayDelta,
    fluxTransitDelta: fluxTransitDelta(sa, sb),
    rvStarDelta: rvStarDelta(sa, sb),
    rvPlanetDelta: rvPlanetDelta(sa, sb),
    visual: buildComparisonVisual({ tSec, displayDelta: fluxDisplayDelta, sa, sb, aSamples, bSamples }),
  };
}

/**
 * Convert a {@link DidacticComparison} into a human-readable multi-line diagnostic string,
 * with optional lesson-specific interpretation if `context.lessonId` is set.
 */
export function interpretDidacticComparison(
  cmp: DidacticComparison,
  context?: { lessonId?: string; comparisonPrompt?: string },
): string {
  const lines: string[] = [];
  appendScalarDeltas(lines, cmp);

  const lessonId = context?.lessonId;
  lines.push(interpretationLine(cmp, lessonId));
  lines.push(dynamicsNote(cmp));

  if (context?.comparisonPrompt) {
    lines.push("");
    lines.push(`Lesson prompt: ${context.comparisonPrompt}`);
  }

  return lines.join("\n");
}
