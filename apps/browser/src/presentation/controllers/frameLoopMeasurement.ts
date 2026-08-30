/**
 * Owns frame Loop Measurement support within the app layer. Keeps application bootstrap and frame orchestration composable.
 */
import { maxSmearingSubsamplesForParams } from "../../domain/model/transitComputeBudget";
import type { BrowserScenarioDraft } from "../../domain/model/types";
import { applyInstrumentNoiseAndSystematics } from "../../domain/photometry/instrumentNoise";
import { smearedFluxAt } from "../../domain/photometry/smearing";
import { readClampSmearedFlux } from "../ui/inputs";
import { getInstrumentCfgFromPhotometry, type NoiseState } from "../../application/noise";
import type { AppSimulationRuntime } from "../../application/v4Runtime";

const shouldSmearMeasuredFlux = (
  cadenceSec: number | undefined,
  nSubsamples: number | undefined,
): boolean => {
  return (cadenceSec ?? 0) > 0 && (nSubsamples ?? 1) > 1;
};

const simulationFluxSampler = (simulation: AppSimulationRuntime): ((tSec: number) => number) => {
  return (sampleTimeSec) => simulation.step(sampleTimeSec).flux.total;
};

const smearedMeasuredFlux = (args: {
  clampSmearedFlux: HTMLInputElement | null;
  simulation: AppSimulationRuntime;
  params: BrowserScenarioDraft;
  tSec: number;
  fluxPhysical: number;
}): number => {
  const { clampSmearedFlux, simulation, params, tSec, fluxPhysical } = args;
  const cadenceSec = params.star.photometry?.cadenceSec;
  const nSubsamples = params.star.photometry?.nSubsamples;
  if (!shouldSmearMeasuredFlux(cadenceSec, nSubsamples)) return fluxPhysical;

  const maxSubsamples = maxSmearingSubsamplesForParams(params);
  if (maxSubsamples <= 1) return fluxPhysical;

  return smearedFluxAt(simulationFluxSampler(simulation), tSec, {
    cadenceSec,
    nSubsamples,
    clamp01: readClampSmearedFlux(clampSmearedFlux),
    maxSubsamples,
  });
};

export const measuredFluxForPlot = (args: {
  clampSmearedFlux: HTMLInputElement | null;
  simulation: AppSimulationRuntime;
  params: BrowserScenarioDraft;
  tSec: number;
  dtSec: number;
  noiseState: NoiseState["noiseState"];
  fluxPhysical: number;
}): number => {
  const { params, tSec, dtSec, noiseState } = args;
  return applyInstrumentNoiseAndSystematics({
    flux: smearedMeasuredFlux(args),
    tSec,
    dtSec,
    cfg: getInstrumentCfgFromPhotometry(params.star.photometry),
    state: noiseState,
  });
};
