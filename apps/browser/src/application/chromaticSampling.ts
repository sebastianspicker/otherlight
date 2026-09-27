/** Builds canonical chromatic configurations and samples retained Education runtimes. */
import { cloneParams } from "../domain/model/clone";
import type { BrowserScenarioDraft } from "../domain/model/types";
import { resolveWeightedPhotometryBands } from "../domain/simulation/v4/nativePhotometry";
import { createSimulationV4, type EducationScenarioV4 } from "../domain/simulation/v4";
import { toChromaticScenarioV4 } from "./browserScenarioAdapter";
export type BandConfiguration = { label: string; configuration: EducationScenarioV4 };
export type BandSamples = { label: string; samples: Array<{ t: number; flux: number }> };
type BandVariantSystem = { label: string; system: BrowserScenarioDraft };
type WeightedPhotometryBand = ReturnType<typeof resolveWeightedPhotometryBands>[number];
function buildBandVariantSystems(system: BrowserScenarioDraft): BandVariantSystem[] {
  const cfg = toChromaticScenarioV4(system);
  const bands = resolveWeightedPhotometryBands(cfg);
  if (bands.length <= 1) return [];

  return bands.map((band, index) => buildBandVariantSystem(system, band, index));
}

function buildBandVariantSystem(
  system: BrowserScenarioDraft,
  band: WeightedPhotometryBand,
  index: number,
): BandVariantSystem {
  const clone = cloneParams(system);
  applySingleSpectralBand(clone, band.lambdaNm);
  applySingleTransmissionBand(clone, band.lambdaNm, index);
  return {
    label: `${Math.round(band.lambdaNm)} nm`,
    system: clone,
  };
}

function applySingleSpectralBand(system: BrowserScenarioDraft, lambdaNm: number): void {
  const bandpass = system.star.photometry?.spectralBandpass;
  if (!bandpass?.enabled || !Array.isArray(bandpass.lambdaNm)) return;

  bandpass.lambdaNm = [lambdaNm];
  bandpass.weights = [1];
}

function applySingleTransmissionBand(
  system: BrowserScenarioDraft,
  lambdaNm: number,
  fallbackIndex: number,
): void {
  const transmission = system.star.photometry?.atmosphereTransmission;
  if (!transmission?.enabled || !Array.isArray(transmission.lambdaNm)) return;

  const pickIndex = pickTransmissionBandIndex(transmission.lambdaNm, lambdaNm, fallbackIndex);
  const pickedLambda = transmission.lambdaNm[pickIndex];
  const tauScale = Array.isArray(transmission.tauScale) ? transmission.tauScale[pickIndex] : undefined;
  if (Number.isFinite(pickedLambda)) transmission.lambdaNm = [pickedLambda as number];
  if (Number.isFinite(tauScale)) transmission.tauScale = [tauScale as number];
}

function pickTransmissionBandIndex(lambdaNmList: number[], lambdaNm: number, fallbackIndex: number): number {
  const matchingIndex = lambdaNmList.findIndex((value) => value === lambdaNm);
  return matchingIndex >= 0 ? matchingIndex : fallbackIndex;
}

export function buildBandConfigurations(system: BrowserScenarioDraft): BandConfiguration[] {
  return buildBandVariantSystems(system).map(({ label, system }) => ({
    label,
    configuration: toChromaticScenarioV4(system),
  }));
}
export function createBandSamplingService(configurations: BandConfiguration[]) {
  const bands = configurations.map(({ label, configuration }) => ({
    label,
    runtime: createSimulationV4(configuration, {}),
  }));
  return (times: number[]): BandSamples[] =>
    bands.map(({ label, runtime }) => ({
      label,
      samples: times.map((t) => {
        const step = runtime.step(t);
        const flux = Number.isFinite(step.debug?.displayFluxValue)
          ? (step.debug!.displayFluxValue as number)
          : step.flux.total;
        return { t, flux };
      }),
    }));
}
