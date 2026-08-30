/**
 * Owns visualization Accessible support within the ui layer. Keeps DOM-facing behavior separate from application orchestration.
 */
import type { BrowserScenarioDraft } from "../../domain/model/types";
import type { LightCurveAccessibleSnapshot } from "../render/lightCurvePlot";
import type { SimulationFrame } from "../../domain/simulation/frames";

export type VisualizationAccessibleSnapshot = {
  sceneGeometry: string;
  plotRange: string;
  series: string;
  events: string;
  ocSummary?: string;
  warnings: string[];
};

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function percent(value: unknown): string {
  return finite(value) ? `${(value * 100).toFixed(1)}%` : "not available";
}

function rangeText(snapshot: LightCurveAccessibleSnapshot): string {
  if (snapshot.sampleCount === 0) return "No plotted samples yet.";
  const time =
    finite(snapshot.timeMinSec) && finite(snapshot.timeMaxSec)
      ? ` Time range ${snapshot.timeMinSec.toFixed(1)} to ${snapshot.timeMaxSec.toFixed(1)} seconds.`
      : "";
  const flux =
    finite(snapshot.fluxMin) && finite(snapshot.fluxMax)
      ? ` Flux range ${snapshot.fluxMin.toFixed(6)} to ${snapshot.fluxMax.toFixed(6)}.`
      : "";
  return `${snapshot.sampleCount} plotted samples.${time}${flux}`;
}

export function buildVisualizationAccessibleSnapshot(args: {
  params: BrowserScenarioDraft;
  step: SimulationFrame;
  timeSec: number;
  plotMode: string;
  plot: LightCurveAccessibleSnapshot;
  warning?: string;
}): VisualizationAccessibleSnapshot {
  const { params, step, timeSec, plotMode, plot, warning } = args;
  const planetVisible = step.renderSignals.visibilityFractions.planet;
  const moonVisible = step.renderSignals.visibilityFractions.moon;
  const occulters = step.debug?.nOcculters ?? 0;
  const moonState = params.moon ? `Moon enabled and ${percent(moonVisible)} visible.` : "Moon disabled.";
  const sceneGeometry = params.binaryStars
    ? `At ${timeSec.toFixed(1)} seconds, ${occulters} ${occulters === 1 ? "stellar disc is" : "stellar discs are"} eclipsing in the detached-binary view. The light curve reports combined flux from two stars.`
    : `At ${timeSec.toFixed(1)} seconds, ${occulters} ${occulters === 1 ? "body is" : "bodies are"} occulting the star. Planet is ${percent(planetVisible)} visible. ${moonState}`;
  return {
    sceneGeometry,
    plotRange: rangeText(plot),
    series: `The active light-curve series is ${plotMode === "measured" ? "measured flux" : "physical flux"}.`,
    events:
      occulters > 0
        ? "A transit or eclipse is in progress."
        : "No transit or eclipse is currently in progress.",
    warnings: warning ? [warning] : [],
  };
}

export function formatLightCurveAccessibleSummary(snapshot: VisualizationAccessibleSnapshot): string {
  return [snapshot.plotRange, snapshot.series, snapshot.events, ...snapshot.warnings]
    .filter(Boolean)
    .join(" ");
}
