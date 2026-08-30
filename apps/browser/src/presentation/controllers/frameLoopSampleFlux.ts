/**
 * Flux sampling for light-curve plot modes (physical vs measured display).
 */
import type { BrowserScenarioDraft } from "../../domain/model/types";
import type { SimulationFrame } from "../../domain/simulation/frames";
import { scaleFluxForDisplay } from "../../application/displayFlux";
import type { FrameLoopContext } from "./frameLoopControllerTypes";
import { measuredFluxForPlot } from "./frameLoopMeasurement";
import type { AppSimulationRuntime } from "../../application/v4Runtime";

const sampleStepForPlot = (
  simulation: AppSimulationRuntime,
  tSec: number,
  stepAtTime?: SimulationFrame,
): SimulationFrame => {
  return stepAtTime && stepAtTime.tObsSec === tSec ? stepAtTime : simulation.step(tSec);
};

const directDisplayFlux = (step: SimulationFrame, plotMode: string): number | undefined => {
  if (plotMode === "measured") return undefined;
  const displayFlux = step.debug?.displayFluxValue;
  return displayFlux !== undefined && Number.isFinite(displayFlux) ? displayFlux : undefined;
};

export function sampleFluxForPlotForContext(
  ctx: FrameLoopContext,
  simulation: AppSimulationRuntime,
  params: BrowserScenarioDraft,
  plotMode: string,
  tSec: number,
  dtSec: number,
  noiseState = ctx.state.noise.noiseState,
  stepAtTime?: SimulationFrame,
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
