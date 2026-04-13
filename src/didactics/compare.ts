import type { SystemParams } from "../core/types";
import { createSimulationV4, migrateSystemParamsToV4 } from "../sim/v4";
import { displayFluxValueForConfig } from "../sim/v4/binaryBaseline";
import type { SimulationStepV3 } from "../sim/v3";

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
  geometry: SimulationStepV3["renderSignals"]["occulterGeometry"];
};

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

function deriveComparisonWindow(stepA: SimulationStepV3, stepB: SimulationStepV3): { startSec: number; endSec: number } {
  const durationSec = Math.max(
    Math.abs(stepA.timing?.planetTransitDurationSec ?? 0),
    Math.abs(stepB.timing?.planetTransitDurationSec ?? 0),
    Math.abs(stepA.timing?.moonTransitDurationSec ?? 0),
    Math.abs(stepB.timing?.moonTransitDurationSec ?? 0),
    1800,
  );
  const extentSec = Math.max(
    Math.abs(stepA.timing?.planetIngressSec ?? 0),
    Math.abs(stepA.timing?.planetEgressSec ?? 0),
    Math.abs(stepA.timing?.moonIngressSec ?? 0),
    Math.abs(stepA.timing?.moonEgressSec ?? 0),
    Math.abs(stepB.timing?.planetIngressSec ?? 0),
    Math.abs(stepB.timing?.planetEgressSec ?? 0),
    Math.abs(stepB.timing?.moonIngressSec ?? 0),
    Math.abs(stepB.timing?.moonEgressSec ?? 0),
  );
  const halfWindowSec = Math.max(3600, durationSec * 3, extentSec + durationSec);
  return { startSec: -halfWindowSec, endSec: halfWindowSec };
}

function createGhost(label: string, step: SimulationStepV3, color: string): ComparisonGhostGeometry {
  return {
    label,
    color,
    geometry: step.renderSignals.occulterGeometry.map((item) => ({ ...item })),
  };
}

function buildComparisonInset(aSamples: ComparisonCurvePoint[], bSamples: ComparisonCurvePoint[]): ComparisonInset {
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

export function compareScenariosAtTime(a: SystemParams, b: SystemParams, tSec: number): DidacticComparison {
  const configA = migrateSystemParamsToV4(a);
  const configB = migrateSystemParamsToV4(b);
  const runtimeA = createSimulationV4(configA);
  const runtimeB = createSimulationV4(configB);
  const sa = runtimeA.step(tSec);
  const sb = runtimeB.step(tSec);
  const { startSec, endSec } = deriveComparisonWindow(sa, sb);
  const sampleCount: number = 96;
  const aSamples: ComparisonCurvePoint[] = [];
  const bSamples: ComparisonCurvePoint[] = [];
  for (let i = 0; i < sampleCount; i++) {
    const frac = sampleCount === 1 ? 0 : i / (sampleCount - 1);
    const tSample = startSec + frac * (endSec - startSec);
    const stepA = runtimeA.step(tSample);
    const stepB = runtimeB.step(tSample);
    aSamples.push({
      t: tSample,
      flux: Number.isFinite(stepA.debug?.displayFluxValue) ? (stepA.debug?.displayFluxValue as number) : stepA.flux.total,
    });
    bSamples.push({
      t: tSample,
      flux: Number.isFinite(stepB.debug?.displayFluxValue) ? (stepB.debug?.displayFluxValue as number) : stepB.flux.total,
    });
  }

  return {
    tSec,
    fluxTotalDelta: sb.flux.total - sa.flux.total,
    fluxDisplayDelta:
      displayFluxValueForConfig(configB, sb.flux.total) - displayFluxValueForConfig(configA, sa.flux.total),
    fluxTransitDelta: (sb.flux.transitFactor ?? 1) - (sa.flux.transitFactor ?? 1),
    rvStarDelta: (sb.observables?.rvStar ?? 0) - (sa.observables?.rvStar ?? 0),
    rvPlanetDelta: (sb.observables?.rvPlanet ?? 0) - (sa.observables?.rvPlanet ?? 0),
    visual: {
      curveSeries: [
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
      ],
      comparisonInset: buildComparisonInset(aSamples, bSamples),
      sceneGhosts: [createGhost("scenario A", sa, "rgba(142, 202, 230, 0.45)"), createGhost("scenario B", sb, "rgba(242, 132, 130, 0.42)")],
      badges: [
        { label: `compare @ ${tSec.toFixed(0)} s`, color: "#ffb703" },
        {
          label: `Δdisplay ${(displayFluxValueForConfig(configB, sb.flux.total) - displayFluxValueForConfig(configA, sa.flux.total)).toExponential(1)}`,
          color: "#f4a261",
        },
      ],
    },
  };
}

// TODO: toExponential is called on every delta value each invocation.
// Not a significant cost in practice, but could be cached if this becomes a hot path.
export function interpretDidacticComparison(
  cmp: DidacticComparison,
  context?: { lessonId?: string; comparisonPrompt?: string },
): string {
  const lines: string[] = [];
  lines.push(`ΔfluxTotal=${cmp.fluxTotalDelta.toExponential(3)}`);
  if (typeof cmp.fluxDisplayDelta === "number" && Number.isFinite(cmp.fluxDisplayDelta)) {
    lines.push(`ΔfluxDisplay=${cmp.fluxDisplayDelta.toExponential(3)}`);
  }
  lines.push(`ΔfluxTransit=${cmp.fluxTransitDelta.toExponential(3)}`);
  lines.push(`ΔrvStar=${(cmp.rvStarDelta ?? 0).toExponential(3)}`);
  lines.push(`ΔrvPlanet=${(cmp.rvPlanetDelta ?? 0).toExponential(3)}`);
  lines.push("");

  const absTransit = Math.abs(cmp.fluxTransitDelta);
  const absTotal = Math.abs(cmp.fluxTotalDelta);
  const absDisplay = Math.abs(cmp.fluxDisplayDelta ?? cmp.fluxTotalDelta);
  const absRvStar = Math.abs(cmp.rvStarDelta ?? 0);
  const absRvPlanet = Math.abs(cmp.rvPlanetDelta ?? 0);

  const lessonId = context?.lessonId;
  if (lessonId === "exomoon-transit-lab") {
    if (absTransit > 1e-4) {
      lines.push(
        "Interpretation: The moon or planet transit timing/geometry changed enough to alter the visible transit morphology.",
      );
    } else {
      lines.push(
        "Interpretation: The moon contribution remains subtle; compare lead/lag and moon visibility.",
      );
    }
  } else if (lessonId === "binary-eclipse-lab") {
    if (absDisplay > 1e-4) {
      lines.push(
        "Interpretation: The displayed binary eclipse depth changed, so the stellar flux balance or eclipse chord is different.",
      );
    } else {
      lines.push("Interpretation: The two binary cases are photometrically similar near this event.");
    }
  } else if (absTransit > 1e-4) {
    lines.push(
      "Interpretation: Transit geometry changed significantly (impact parameter / radius / inclination).",
    );
  } else if (absTotal > 1e-4) {
    lines.push(
      "Interpretation: Additive photometry dominates the change (reflection / emission / stellar variability).",
    );
  } else {
    lines.push("Interpretation: Only minor photometric differences; the two scenarios are similar.");
  }

  if (absRvStar > 1e-3 || absRvPlanet > 1e-3) {
    lines.push("Dynamics note: RV deltas indicate changed mass or orbital dynamics.");
  } else {
    lines.push("Dynamics note: No significant radial-velocity shift.");
  }

  if (context?.comparisonPrompt) {
    lines.push("");
    lines.push(`Lesson prompt: ${context.comparisonPrompt}`);
  }

  return lines.join("\n");
}
