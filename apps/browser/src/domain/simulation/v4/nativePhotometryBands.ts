/** Resolves weighted photometry bands for native V4 scenarios. */
import { spectralContaminationWeight } from "../../photometry/atmosphereRT/model";
import type { EducationScenarioV4 } from "./types";
import type { WeightedPhotometryBand } from "./nativePhotometryTypes";

type LegacyTransmissionGrid = { lambdaNm: number[]; tauScale: number[] };
type PositiveWavelengthGrid = { keepIdx: number[]; lambdaNm: number[]; rawLength: number };
const isFinitePositive = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

export function resolveWeightedPhotometryBands(config: EducationScenarioV4): WeightedPhotometryBand[] {
  const phot = config.photometry;
  const legacy = normalizeLegacyTransmissionGrid(config);
  const spectralBands = resolveSpectralBandpassBands(config, legacy);
  if (spectralBands) return spectralBands;
  if (legacy) return equalWeightLegacyBands(legacy);
  const lambdaNm = isFinitePositive(phot?.atmosphereRT?.lambdaRefNm)
    ? (phot?.atmosphereRT?.lambdaRefNm as number)
    : 550;
  return [{ lambdaNm, weight: 1, legacyTauScale: 1 }];
}

const normalizeLegacyTransmissionGrid = (config: EducationScenarioV4): LegacyTransmissionGrid | null => {
  const atmosphere = config.photometry?.atmosphereTransmission;
  if (!atmosphere?.enabled || !Array.isArray(atmosphere.lambdaNm) || atmosphere.lambdaNm.length === 0)
    return null;
  const wavelengths = positiveWavelengthGrid(atmosphere.lambdaNm);
  return wavelengths
    ? { lambdaNm: wavelengths.lambdaNm, tauScale: normalizeLegacyTauScale(atmosphere.tauScale, wavelengths) }
    : null;
};

const positiveWavelengthGrid = (lambdaRaw: unknown[]): PositiveWavelengthGrid | null => {
  const keepIdx: number[] = [];
  const lambdaNm: number[] = [];
  for (let index = 0; index < lambdaRaw.length; index++) {
    const value = lambdaRaw[index];
    if (!isFinitePositive(value)) continue;
    keepIdx.push(index);
    lambdaNm.push(value);
  }
  return lambdaNm.length > 0 ? { keepIdx, lambdaNm, rawLength: lambdaRaw.length } : null;
};

const normalizeLegacyTauScale = (rawTauScale: unknown, wavelengths: PositiveWavelengthGrid): number[] => {
  const tauRaw = Array.isArray(rawTauScale) ? rawTauScale : [];
  if (tauRaw.length === 1 && Number.isFinite(tauRaw[0]))
    return wavelengths.lambdaNm.map(() => Math.max(0, tauRaw[0] as number));
  if (tauRaw.length === wavelengths.rawLength)
    return wavelengths.keepIdx.map((index) => finiteNonNegativeOrOne(tauRaw[index]));
  if (tauRaw.length === wavelengths.lambdaNm.length) return tauRaw.map(finiteNonNegativeOrOne);
  return wavelengths.lambdaNm.map(() => 1);
};

const finiteNonNegativeOrOne = (value: unknown): number =>
  Number.isFinite(value) ? Math.max(0, value as number) : 1;

const resolveSpectralBandpassBands = (
  config: EducationScenarioV4,
  legacy: LegacyTransmissionGrid | null,
): WeightedPhotometryBand[] | undefined => {
  const phot = config.photometry;
  const bandpass = phot?.spectralBandpass;
  const lambdaNm = enabledBandpassWavelengths(bandpass);
  if (!lambdaNm) return undefined;
  const rawWeights =
    Array.isArray(bandpass?.weights) && bandpass.weights.length === lambdaNm.length
      ? bandpass.weights
      : lambdaNm.map(() => 1);
  const legacyTauScale =
    legacy && legacy.lambdaNm.length === lambdaNm.length ? legacy.tauScale : lambdaNm.map(() => 1);
  const normalized = normalizedSpectralWeights(lambdaNm, rawWeights, phot?.atmosphereRT);
  return lambdaNm.map((value, index) => ({
    lambdaNm: value,
    weight: normalized[index],
    legacyTauScale: legacyTauScale[index] ?? 1,
  }));
};

const enabledBandpassWavelengths = (
  bandpass: NonNullable<EducationScenarioV4["photometry"]>["spectralBandpass"] | undefined,
): number[] | undefined => {
  if (!bandpass?.enabled || !Array.isArray(bandpass.lambdaNm) || bandpass.lambdaNm.length === 0)
    return undefined;
  const lambdaNm = bandpass.lambdaNm.filter((value) => isFinitePositive(value));
  return lambdaNm.length > 0 ? lambdaNm : undefined;
};

const normalizedSpectralWeights = (
  lambdaNm: number[],
  rawWeights: unknown[],
  atmosphereRT: NonNullable<EducationScenarioV4["photometry"]>["atmosphereRT"],
): number[] => {
  const weighted = rawWeights.map((value, index) => {
    const base = Number.isFinite(value) && (value as number) > 0 ? (value as number) : 0;
    return base * spectralContaminationWeight({ lambdaNm: lambdaNm[index], config: atmosphereRT });
  });
  const sum = weighted.reduce((accumulator, value) => accumulator + value, 0);
  return sum > 0 ? weighted.map((value) => value / sum) : lambdaNm.map(() => 1 / lambdaNm.length);
};

const equalWeightLegacyBands = (legacy: LegacyTransmissionGrid): WeightedPhotometryBand[] => {
  const weight = 1 / legacy.lambdaNm.length;
  return legacy.lambdaNm.map((value, index) => ({
    lambdaNm: value,
    weight,
    legacyTauScale: legacy.tauScale[index] ?? 1,
  }));
};
