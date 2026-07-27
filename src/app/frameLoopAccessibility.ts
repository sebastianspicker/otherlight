/**
 * Owns frame Loop Accessibility support within the app layer. Keeps application bootstrap and frame orchestration composable.
 */
import type { SystemParams } from "../core/types";
import type { SimulationStepV3 } from "../sim/v3";
import {
  buildVisualizationAccessibleSnapshot,
  formatLightCurveAccessibleSummary,
} from "../ui/visualizationAccessible";
import type { FrameLoopContext } from "./frameLoopControllerLogic";

const accessibleSummaryKeys = new WeakMap<HTMLElement, string>();

type AccessibleSummaryElements = {
  skySummary: HTMLElement | null;
  lcSummary: HTMLElement | null;
};

const accessibleSummaryElements = (): AccessibleSummaryElements | undefined => {
  if (typeof document === "undefined") return undefined;
  const skySummary = document.getElementById("skySummary");
  const lcSummary = document.getElementById("lcSummary");
  return skySummary || lcSummary ? { skySummary, lcSummary } : undefined;
};

const accessibleSummaryKey = (
  ctx: FrameLoopContext,
  params: SystemParams,
  step: SimulationStepV3,
  plotMode: string,
  warning: string,
): string =>
  [
    Math.floor(ctx.state.t / 30),
    step.debug?.nOcculters ?? 0,
    plotMode,
    params.star.r,
    params.planet.r,
    params.moon?.r ?? "none",
    params.binaryStars ? "binary" : "planetary",
    warning,
  ].join(":");

const hasCurrentAccessibleSummaries = (
  { skySummary, lcSummary }: AccessibleSummaryElements,
  key: string,
): boolean =>
  (!skySummary || accessibleSummaryKeys.get(skySummary) === key) &&
  (!lcSummary || accessibleSummaryKeys.get(lcSummary) === key);

const updateAccessibleSummary = (element: HTMLElement | null, key: string, summary: string): void => {
  if (!element || accessibleSummaryKeys.get(element) === key) return;
  element.textContent = summary;
  accessibleSummaryKeys.set(element, key);
};

export const updateAccessibleVisualizationSummary = (
  ctx: FrameLoopContext,
  params: SystemParams,
  step: SimulationStepV3,
  plotMode: string,
): void => {
  const elements = accessibleSummaryElements();
  if (!elements) return;
  const warning = ctx.refs.warnVal?.textContent ?? undefined;
  const key = accessibleSummaryKey(ctx, params, step, plotMode, warning ?? "");
  if (hasCurrentAccessibleSummaries(elements, key)) return;
  const snapshot = buildVisualizationAccessibleSnapshot({
    params,
    step,
    timeSec: ctx.state.t,
    plotMode,
    plot: ctx.plot.getAccessibleSnapshot(),
    warning,
  });
  updateAccessibleSummary(elements.skySummary, key, snapshot.sceneGeometry);
  updateAccessibleSummary(elements.lcSummary, key, formatLightCurveAccessibleSummary(snapshot));
};
