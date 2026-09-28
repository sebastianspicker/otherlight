/** Tracks successful fixed previews independently of the live sample timestamp. */
import type { BrowserScenarioDraft } from "../../domain/model/types";
import type { AppSimulationRuntime } from "../../application/runtime/v4Runtime";
import type { NoiseState } from "../../application/runtime/noise";

import type { SimulationFrame } from "../../domain/simulation/frames";
import type { LightCurveOverlaySeries } from "../render/lightCurve/lightCurvePlotTypes";
export type FixedPreviewPresentation = {
  anchorStep: SimulationFrame;
  times: number[];
  overlaySeries: LightCurveOverlaySeries[];
};
export type FixedPreviewKey = { runtime: AppSimulationRuntime; settings: string; generation: number };
export type FixedPreviewState = {
  fixedPreviewKey?: FixedPreviewKey;
  previewGeneration?: number;
  displayFluxScale: number;
  noise: NoiseState;
};
export function invalidateFixedPreview(state: {
  fixedPreviewPresentation?: FixedPreviewPresentation;
  fixedPreviewKey?: FixedPreviewKey;
  previewGeneration?: number;
}): void {
  state.fixedPreviewKey = undefined;
  state.fixedPreviewPresentation = undefined;
  state.previewGeneration = (state.previewGeneration ?? 0) + 1;
}
export function fixedPreviewKey(
  runtime: AppSimulationRuntime,
  params: BrowserScenarioDraft,
  plotMode: string,
  state: FixedPreviewState,
  clampSmearedFlux = false,
): FixedPreviewKey {
  return {
    runtime,
    generation: state.previewGeneration ?? 0,
    settings: JSON.stringify([
      runtime.getMode(),
      plotMode,
      state.displayFluxScale,
      params.star.photometry,
      state.noise.noiseSeed,
      clampSmearedFlux,
    ]),
  };
}
export function matchesFixedPreview(left: FixedPreviewKey | undefined, right: FixedPreviewKey): boolean {
  return (
    left?.runtime === right.runtime &&
    left.settings === right.settings &&
    left.generation === right.generation
  );
}
