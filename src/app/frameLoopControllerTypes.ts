/**
 * Shared frame-loop controller types used by reset/seek/frame orchestration.
 */
import type { SystemParams } from "../core/types";
import type { SimulationStepV3 } from "../sim/v3";
import type { FrameLoopDeps } from "./frameLoop";
import type { ApplyDynamicVisualizationStateArgs } from "./frameLoopDynamicVisualization";
import type { NoiseState } from "./noise";
import type { AppSimulationRuntime } from "./v4Runtime";

export type FrameLoopControllerApi = {
  frame: (now: number) => void;
  start: () => void;
  dispose: () => void;
  setRunning: (next: boolean) => void;
  resetSimTimeAndLC: (opts?: { resetNoise?: boolean }) => void;
  seekToTime: (targetSec: number, opts?: { resetNoise?: boolean }) => void;
  invalidate: () => void;
};

export type SampleFluxForPlot = (
  simulation: AppSimulationRuntime,
  params: SystemParams,
  plotMode: string,
  tSec: number,
  dtSec: number,
  noiseState?: NoiseState["noiseState"],
  stepAtTime?: SimulationStepV3,
) => number;

export type FrameLoopContext = FrameLoopDeps & {
  applyDynamicVisualizationStateSafely: (args: ApplyDynamicVisualizationStateArgs) => string | undefined;
  queueNextFrame: () => void;
  sampleFluxForPlot: SampleFluxForPlot;
  setRunning: (next: boolean) => void;
};

export type PlotModes = {
  plotMode: string;
  trackingMode: string;
};

export type StepAttempt = {
  step: SimulationStepV3;
  errorMessage: string;
};

export type FrameSampleResult = {
  fluxForPlot: number;
  shouldSample: boolean;
};
