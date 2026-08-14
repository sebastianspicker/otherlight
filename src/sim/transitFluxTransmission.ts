/** Normalizes spectral transmission inputs and evaluates transmissive occultation. */
import type { SystemParams } from "../core/types";
import { maxSpectralSamplesForGrid } from "../core/transitComputeBudget";
import { isFiniteNonNegative, isFinitePositive } from "../core/units";
import { spectralContaminationWeight, totalAtmosphereTransmission } from "../photometry/atmosphereRT/model";
import {
  fluxStarWithTransmissiveOcculters,
  type TransmissionOcculter,
} from "../photometry/transitTransmission";
import { isPhysicsFeatureEnabled } from "./fidelity";
import type { BodyKinematics } from "./kinematics";
import {
  finiteClampedFlux,
  resolveTransitLimbDarkeningLaw,
  type StarPhotometry,
  type TransitFluxInputs,
} from "./transitFluxOccultation";

type AtmosphereTransmissionConfig = NonNullable<NonNullable<StarPhotometry>["atmosphereTransmission"]>;
type AtmosphereRTConfig = NonNullable<NonNullable<StarPhotometry>["atmosphereRT"]>;
type AtmosphereRTLayerConfig = NonNullable<NonNullable<AtmosphereRTConfig["layers"]>[number]>;
type BodySky = { x: number; y: number; z: number };
type BodyProjection = { dx: number; dy: number; r0: number };
type TransmissionBuildContext = {
  atm: AtmosphereTransmissionConfig | undefined;
  rt: AtmosphereRTConfig | undefined;
  rStar: number;
  tauScale: number;
  lambdaNm: number | undefined;
  target: string;
};
type LambdaGrid = { lambdaNm: number[]; keepIdx: number[]; rawLength: number };
type SpectralGrid = { lambdaNm: number[]; weights: number[]; tauScale: number[] };
type SpectralSample = { lambdaNm: number; weight: number; tauScale: number };

function activeAtmosphereTransmission(params: SystemParams, phot: StarPhotometry): boolean {
  if (phot?.atmosphereTransmission?.enabled) return true;
  return isPhysicsFeatureEnabled(params, "atmosphereRT") && Boolean(phot?.atmosphereRT?.enabled);
}

function makeTransmissionBuildContext(
  params: SystemParams,
  opts?: { tauScale?: number; lambdaNm?: number },
): TransmissionBuildContext | undefined {
  const phot = params.star.photometry;
  const atm = phot?.atmosphereTransmission;
  const rt = phot?.atmosphereRT;
  if (!atm?.enabled && !rt?.enabled) return undefined;
  const rStar = params.star?.r;
  if (!isFinitePositive(rStar)) return undefined;
  return {
    atm,
    rt,
    rStar,
    tauScale: isFiniteNonNegative(opts?.tauScale) ? opts.tauScale : 1,
    lambdaNm: isFinitePositive(opts?.lambdaNm) ? opts.lambdaNm : undefined,
    target: rt?.enabled ? (rt.target ?? "planet") : (atm?.target ?? "planet"),
  };
}

function bodyProjection(
  body: { r: number },
  sky: BodySky | undefined,
  rStar: number,
): BodyProjection | undefined {
  if (!sky || !(sky.z > 0) || !isFinitePositive(body.r)) return undefined;
  const r0 = body.r;
  if (!(Math.hypot(sky.x, sky.y) < rStar + r0)) return undefined;
  return { dx: sky.x, dy: sky.y, r0 };
}

function validRtLayers(rt: AtmosphereRTConfig | undefined): AtmosphereRTLayerConfig[] {
  if (!rt?.enabled || !Array.isArray(rt.layers) || rt.layers.length === 0) return [];
  return rt.layers.filter(
    (layer): layer is AtmosphereRTLayerConfig =>
      Boolean(layer) &&
      isFinitePositive(layer.r0) &&
      isFinitePositive(layer.H) &&
      isFiniteNonNegative(layer.tau0),
  );
}

function rtTransmissionOcculter(
  projection: BodyProjection,
  rt: AtmosphereRTConfig,
  lambdaNm: number | undefined,
): TransmissionOcculter {
  const layers = validRtLayers(rt);
  if (layers.length === 0) return projection;
  return {
    ...projection,
    transmission: (rho: number): number => {
      if (!Number.isFinite(rho) || rho < 0) return 1;
      if (rho <= projection.r0) return 0;
      return totalAtmosphereTransmission({ rho, config: { ...rt, layers }, lambdaNm });
    },
  };
}

function legacyTransmissionOcculter(
  projection: BodyProjection,
  atm: AtmosphereTransmissionConfig | undefined,
  isTarget: boolean,
  tauScale: number,
): TransmissionOcculter {
  // The body radius is the opaque core. Legacy r0 describes the atmospheric
  // reference radius, so it must not make a physical body transparent or smaller.
  const core = projection.r0;
  const haloReferenceRadius = isTarget && isFinitePositive(atm?.r0) ? atm.r0 : core;
  const kind = atm?.kind ?? "hard";
  const H = isFinitePositive(atm?.H) ? atm.H : 0;
  const tau0 = isFiniteNonNegative(atm?.tau0) ? atm.tau0 : 0;
  const tau0Scaled = tau0 * tauScale;
  const transmission =
    kind !== "exponential-halo" || H <= 0 || tau0Scaled <= 0
      ? undefined
      : (rho: number): number => {
          if (!Number.isFinite(rho) || rho < 0) return 1;
          if (rho <= core) return 0;
          const tau = tau0Scaled * Math.exp(-(rho - haloReferenceRadius) / H);
          return Math.exp(-Math.max(0, tau));
        };
  return { dx: projection.dx, dy: projection.dy, r0: core, transmission };
}

function transmissionOcculterForBody(
  ctx: TransmissionBuildContext,
  body: { r: number },
  sky: BodySky | undefined,
  isTarget: boolean,
): TransmissionOcculter | undefined {
  const projection = bodyProjection(body, sky, ctx.rStar);
  if (!projection) return undefined;
  if (!isTarget) return projection;
  if (ctx.rt?.enabled) return rtTransmissionOcculter(projection, ctx.rt, ctx.lambdaNm);
  return legacyTransmissionOcculter(projection, ctx.atm, isTarget, ctx.tauScale);
}

function buildTransmissionOcculters(
  params: SystemParams,
  kin: BodyKinematics,
  opts?: { tauScale?: number; lambdaNm?: number },
): TransmissionOcculter[] {
  const ctx = makeTransmissionBuildContext(params, opts);
  if (!ctx) return [];
  const occulters: TransmissionOcculter[] = [];
  const planet = transmissionOcculterForBody(ctx, params.planet, kin.planetSky, ctx.target === "planet");
  if (planet) occulters.push(planet);
  if (params.moon && kin.moonSky) {
    const moon = transmissionOcculterForBody(ctx, params.moon, kin.moonSky, ctx.target === "moon");
    if (moon) occulters.push(moon);
  }
  return occulters;
}

function positiveLambdaGrid(lambdaRaw: unknown): LambdaGrid | null {
  if (!Array.isArray(lambdaRaw)) return null;
  const validIndices: number[] = [];
  for (let index = 0; index < lambdaRaw.length; index++) {
    if (isFinitePositive(lambdaRaw[index])) {
      validIndices.push(index);
    }
  }
  if (validIndices.length === 0) return null;
  return {
    lambdaNm: validIndices.map((index) => lambdaRaw[index] as number),
    keepIdx: validIndices,
    rawLength: lambdaRaw.length,
  };
}

function aggregateSpectralSamples(samples: SpectralSample[], sampleLimit: number): SpectralGrid {
  const rawWeightSum = samples.reduce((total, sample) => total + Math.max(0, sample.weight), 0);
  const weighted = (rawWeightSum > 0 ? samples.filter((sample) => sample.weight > 0) : samples)
    .map((sample) => ({
      ...sample,
      weight: rawWeightSum > 0 ? sample.weight / rawWeightSum : 1 / samples.length,
    }))
    .sort((a, b) => a.lambdaNm - b.lambdaNm);
  const limit = Math.max(1, Math.floor(sampleLimit));
  const buckets = Math.min(limit, weighted.length);
  const lambdaNm: number[] = [];
  const weights: number[] = [];
  const tauScale: number[] = [];
  for (let bucket = 0; bucket < buckets; bucket++) {
    const start = Math.floor((bucket * weighted.length) / buckets);
    const end = Math.floor(((bucket + 1) * weighted.length) / buckets);
    const entries = weighted.slice(start, end);
    const weight = entries.reduce((total, entry) => total + entry.weight, 0);
    const denominator = weight > 0 ? weight : entries.length;
    lambdaNm.push(entries.reduce((total, entry) => total + entry.lambdaNm * entry.weight, 0) / denominator);
    tauScale.push(entries.reduce((total, entry) => total + entry.tauScale * entry.weight, 0) / denominator);
    weights.push(weight);
  }
  const weightSum = weights.reduce((total, weight) => total + weight, 0);
  return {
    lambdaNm,
    weights:
      weightSum > 0 ? weights.map((weight) => weight / weightSum) : weights.map(() => 1 / weights.length),
    tauScale,
  };
}

function legacyTauScale(lambdaGrid: LambdaGrid, tauRaw: number[] | undefined): number[] {
  const safe = (value: number | undefined): number =>
    typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 1;
  if (!Array.isArray(tauRaw)) return lambdaGrid.lambdaNm.map(() => 1);
  if (tauRaw.length === 1 && Number.isFinite(tauRaw[0]))
    return lambdaGrid.lambdaNm.map(() => safe(tauRaw[0]));
  if (tauRaw.length === lambdaGrid.rawLength) return lambdaGrid.keepIdx.map((index) => safe(tauRaw[index]));
  if (tauRaw.length === lambdaGrid.lambdaNm.length) return tauRaw.map(safe);
  return lambdaGrid.lambdaNm.map(() => 1);
}

function normalizeLegacySpectralGrid(
  atm: AtmosphereTransmissionConfig | undefined,
  sampleLimit: number,
): SpectralGrid | null {
  const lambdaGrid = positiveLambdaGrid(atm?.lambdaNm);
  if (!lambdaGrid) return null;
  const tauScale = legacyTauScale(lambdaGrid, atm?.tauScale);
  return aggregateSpectralSamples(
    lambdaGrid.lambdaNm.map((lambdaNm, index) => ({ lambdaNm, weight: 1, tauScale: tauScale[index] })),
    sampleLimit,
  );
}

function normalizeBandpassSpectralGrid(phot: StarPhotometry, sampleLimit: number): SpectralGrid | null {
  const bp = phot?.spectralBandpass;
  if (!bp?.enabled) return null;
  const lambdaGrid = positiveLambdaGrid(bp.lambdaNm);
  if (!lambdaGrid) return null;
  const rawWeights = Array.isArray(bp.weights) ? bp.weights : [];
  const selectedWeights =
    rawWeights.length === lambdaGrid.rawLength
      ? lambdaGrid.keepIdx.map((index) => rawWeights[index])
      : rawWeights.length === lambdaGrid.lambdaNm.length
        ? rawWeights
        : lambdaGrid.lambdaNm.map(() => 1);
  return aggregateSpectralSamples(
    lambdaGrid.lambdaNm.map((lambdaNm, index) => ({
      lambdaNm,
      weight:
        (Number.isFinite(selectedWeights[index]) && selectedWeights[index] > 0 ? selectedWeights[index] : 0) *
        spectralContaminationWeight({ lambdaNm, config: phot?.atmosphereRT }),
      tauScale: 1,
    })),
    sampleLimit,
  );
}

function normalizeBandpassGrid(phot: StarPhotometry, gridRes: number | undefined): SpectralGrid | null {
  const sampleLimit = maxSpectralSamplesForGrid(gridRes, 256);
  return (
    normalizeBandpassSpectralGrid(phot, sampleLimit) ??
    normalizeLegacySpectralGrid(phot?.atmosphereTransmission, sampleLimit)
  );
}

function transmissionBandFlux(
  params: SystemParams,
  kin: BodyKinematics,
  inputs: TransitFluxInputs,
  opts: { tauScale?: number; lambdaNm?: number; bandpass?: unknown },
): number {
  const occulters = buildTransmissionOcculters(params, kin, opts);
  if (occulters.length === 0) return 1.0;
  return fluxStarWithTransmissiveOcculters({
    rStar: inputs.rStar,
    occulters,
    limbDarkening: resolveTransitLimbDarkeningLaw(inputs.phot, opts.bandpass),
    brightnessPatches: inputs.patches,
    gridRes: inputs.gridRes,
    clamp01: true,
  });
}

export function computeTransmissionFlux(
  params: SystemParams,
  kin: BodyKinematics,
  inputs: TransitFluxInputs,
): number | undefined {
  if (!activeAtmosphereTransmission(params, inputs.phot) || !inputs.allCircles) return undefined;
  const spectral = normalizeBandpassGrid(inputs.phot, inputs.gridRes);
  if (!spectral) return finiteClampedFlux(transmissionBandFlux(params, kin, inputs, {}));

  let sum = 0;
  let weightSum = 0;
  for (let index = 0; index < spectral.lambdaNm.length; index++) {
    const lambdaNm = spectral.lambdaNm[index];
    const flux = transmissionBandFlux(params, kin, inputs, {
      tauScale: spectral.tauScale[index],
      lambdaNm,
      bandpass: String(lambdaNm),
    });
    if (!Number.isFinite(flux)) continue;
    sum += flux * spectral.weights[index];
    weightSum += spectral.weights[index];
  }
  return weightSum > 0 ? finiteClampedFlux(sum / weightSum) : 1.0;
}

export function warnUnsupportedTransmission(params: SystemParams, inputs: TransitFluxInputs): void {
  if (!activeAtmosphereTransmission(params, inputs.phot) || inputs.allCircles) return;
  console.warn(
    "[computeTransitFlux] atmosphere transmission currently applies only to circular occulters; falling back to the non-transmissive mixed-shape solver.",
  );
}
