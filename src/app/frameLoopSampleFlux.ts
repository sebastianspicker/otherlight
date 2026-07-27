/**
 * Flux sampling for light-curve plot modes (physical vs measured display).
 */
import type { SystemParams } from "../core/types";
import type { SimulationStepV3 } from "../sim/v3";
import { scaleFluxForDisplay } from "./displayFlux";
import type { FrameLoopContext } from "./frameLoopControllerTypes";
import { measuredFluxForPlot } from "./frameLoopMeasurement";
import type { AppSimulationRuntime } from "./v4Runtime";

const sampleStepForPlot = (
  simulation: AppSimulationRuntime,
  tSec: number,
  stepAtTime?: SimulationStepV3,
): SimulationStepV3 => {
  return stepAtTime && stepAtTime.tObsSec === tSec ? stepAtTime : simulation.step(tSec);
};

const directDisplayFlux = (step: SimulationStepV3, plotMode: string): number | undefined => {
  if (plotMode === "measured") return undefined;
  const displayFlux = step.debug?.displayFluxValue;
  return displayFlux !== undefined && Number.isFinite(displayFlux) ? displayFlux : undefined;
};

export function sampleFluxForPlotForContext(
  ctx: FrameLoopContext,
  simulation: AppSimulationRuntime,
  params: SystemParams,
  plotMode: string,
  tSec: number,
  dtSec: number,
  noiseState = ctx.state.noise.noiseState,
  stepAtTime?: SimulationStepV3,
): number {
  const sampledStep = sampleStepForPlot(simulation, tSec, stepAtTime);
  const displayFlux = directDisplayFlux(sampledStep, plotMode);
  if (displayFlux !== undefined) return displayFlux;

  const fluxPhysical = sampledStep.flux.total;
  const fluxForPlot =
    plotMode === "measured"
      ? measuredFluxForPlot({
          clampSmearedFlux: ctx.refs.clampSmearedFlux,
          simulation,
          params,
          tSec,
          dtSec,
          noiseState,
          fluxPhysical,
        })
      : fluxPhysical;
  return scaleFluxForDisplay(fluxForPlot, ctx.state.displayFluxScale);
}
