/** Combines stellar occultation and photometric terms into normalized transit flux. */
//
// Compute multiplicative stellar transit attenuation factor F_transit in [0,1].
//
// Policy:
// - If atmosphereTransmission is enabled, use the transmissive integrator (square grid).
//   * Limb darkening uses the resolved law (any supported type); otherwise it falls back to uniform.
//   * If lambdaNm is provided, average over spectral samples (tauScale optional).
// - Else if limbDarkeningModel is configured AND optional LD integrators are available, use LD integrator.
// - Otherwise use uniform-disk integrator.
// - If brightness patches are configured, prefer the patched uniform-disk integrator.
// - Always clamp output into [0,1] and fail-open to 1.0 on non-finite results.

import type { BrightnessPatch, LimbDarkeningLaw, PassbandId, SystemParams } from "../core/types";
import { clamp01, isFiniteNonNegative, isFinitePositive } from "../core/units";
import type { CircleOcculter } from "../photometry/occulterCircle";
import { fluxUniformDisk } from "../photometry/transitUniform";
import { fluxUniformDiskWithPatches } from "../photometry/transitUniformSpots";
import { resolveLimbDarkeningForBand } from "../photometry/limbDarkening";
import { type OcculterShape, isCircleOcculter } from "../photometry/occulterEllipse";
import {
  fluxLimbDarkenedDiskShapes,
  fluxUniformDiskShapes,
  fluxUniformDiskWithPatchesShapes,
} from "../photometry/transitShapes";
import {
  fluxStarWithTransmissiveOcculters,
  type TransmissionOcculter,
} from "../photometry/transitTransmission";
import { spectralContaminationWeight, totalAtmosphereTransmission } from "../photometry/atmosphereRT/model";
import type { BodyKinematics } from "./kinematics";
import { getLdIntegrators } from "./optionalLimbDarkening";
import { isPhysicsFeatureEnabled } from "./fidelity";
import { MAX_SPECTRAL_SAMPLES, maxSpectralSamplesForGrid } from "../core/transitComputeBudget";

export { MAX_SPECTRAL_SAMPLES } from "../core/transitComputeBudget";

type StarPhotometry = SystemParams["star"]["photometry"];
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
type TransitFluxInputs = {
  rStar: number;
  phot: StarPhotometry;
  patches: BrightnessPatch[] | undefined;
  gridRes: number | undefined;
  frontVisibleOcculters: OcculterShape[];
  allCircles: boolean;
  circleOcculters: CircleOcculter[];
};

function sameOcculterCenter(
  shape: OcculterShape,
  sky: { x: number; y: number } | undefined,
  eps = 1e-9,
): boolean {
  if (!sky) return false;
  return Math.abs(shape.dx - sky.x) <= eps && Math.abs(shape.dy - sky.y) <= eps;
}

function filterFrontVisibleOcculters(occulters: OcculterShape[], kin: BodyKinematics): OcculterShape[] {
  const planetBehind = !(kin.planetSky.z > 0);
  const moonBehind = kin.moonSky ? !(kin.moonSky.z > 0) : false;
  if (!planetBehind && !moonBehind) return occulters;

  return occulters.filter((shape) => {
    if (planetBehind && sameOcculterCenter(shape, kin.planetSky)) return false;
    if (moonBehind && sameOcculterCenter(shape, kin.moonSky)) return false;
    return true;
  });
}

function resolveLimbDarkeningLaw(
  phot: SystemParams["star"]["photometry"] | undefined,
  bandpass?: unknown,
): LimbDarkeningLaw | undefined {
  const ldModel = phot?.limbDarkeningModel;
  if (!ldModel) return undefined;

  const ld = getLdIntegrators();
  const law = ld
    ? (ld.resolveLimbDarkeningForBand(ldModel, bandpass) as LimbDarkeningLaw | undefined)
    : resolveLimbDarkeningForBand(ldModel, bandpass as PassbandId | undefined);

  return law && typeof law.kind === "string" ? law : undefined;
}

function safeTauScale(value: number | undefined): number {
  return isFiniteNonNegative(value) ? value : 1;
}

function safeLambdaNm(value: number | undefined): number | undefined {
  return isFinitePositive(value) ? value : undefined;
}

function activeAtmosphereTransmission(params: SystemParams, phot: StarPhotometry): boolean {
  if (phot?.atmosphereTransmission?.enabled) return true;
  return isPhysicsFeatureEnabled(params, "atmosphereRT") && Boolean(phot?.atmosphereRT?.enabled);
}

function transmissionTarget(
  atm: AtmosphereTransmissionConfig | undefined,
  rt: AtmosphereRTConfig | undefined,
): string {
  if (rt?.enabled) return rt.target ?? "planet";
  return atm?.target ?? "planet";
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
    tauScale: safeTauScale(opts?.tauScale),
    lambdaNm: safeLambdaNm(opts?.lambdaNm),
    target: transmissionTarget(atm, rt),
  };
}

function bodyProjection(
  body: { r: number },
  sky: BodySky | undefined,
  rStar: number,
): BodyProjection | undefined {
  if (!sky) return undefined;
  if (!(sky.z > 0)) return undefined;
  if (!isFinitePositive(body.r)) return undefined;

  const r0 = body.r;
  const overlapsStar = Math.hypot(sky.x, sky.y) < rStar + r0;
  if (!overlapsStar) return undefined;
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
      return totalAtmosphereTransmission({
        rho,
        config: { ...rt, layers },
        lambdaNm,
      });
    },
  };
}

function legacyAtmosphereCore(
  projection: BodyProjection,
  atm: AtmosphereTransmissionConfig | undefined,
  isTarget: boolean,
): number {
  if (isTarget && isFinitePositive(atm?.r0)) return atm.r0;
  return projection.r0;
}

function legacyTransmissionFunction(
  atm: AtmosphereTransmissionConfig | undefined,
  core: number,
  tauScale: number,
): TransmissionOcculter["transmission"] {
  const kind = atm?.kind ?? "hard";
  const H = isFinitePositive(atm?.H) ? atm.H : 0;
  const tau0 = isFiniteNonNegative(atm?.tau0) ? atm.tau0 : 0;
  const tau0Scaled = tau0 * tauScale;
  if (kind !== "exponential-halo" || H <= 0 || tau0Scaled <= 0) return undefined;

  return (rho: number): number => {
    if (!Number.isFinite(rho) || rho < 0) return 1;
    if (rho <= core) return 0;
    const tau = tau0Scaled * Math.exp(-(rho - core) / H);
    return Math.exp(-Math.max(0, tau));
  };
}

function legacyTransmissionOcculter(
  projection: BodyProjection,
  atm: AtmosphereTransmissionConfig | undefined,
  isTarget: boolean,
  tauScale: number,
): TransmissionOcculter {
  const core = legacyAtmosphereCore(projection, atm, isTarget);
  return {
    dx: projection.dx,
    dy: projection.dy,
    r0: core,
    transmission: legacyTransmissionFunction(atm, core, tauScale),
  };
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

function appendTransmissionOcculter(
  occulters: TransmissionOcculter[],
  ctx: TransmissionBuildContext,
  body: { r: number },
  sky: BodySky | undefined,
  isTarget: boolean,
): void {
  const occulter = transmissionOcculterForBody(ctx, body, sky, isTarget);
  if (occulter) occulters.push(occulter);
}

function buildTransmissionOcculters(
  params: SystemParams,
  kin: BodyKinematics,
  opts?: { tauScale?: number; lambdaNm?: number },
): TransmissionOcculter[] {
  const ctx = makeTransmissionBuildContext(params, opts);
  if (!ctx) return [];
  const occulters: TransmissionOcculter[] = [];

  appendTransmissionOcculter(occulters, ctx, params.planet, kin.planetSky, ctx.target === "planet");
  if (params.moon && kin.moonSky) {
    appendTransmissionOcculter(occulters, ctx, params.moon, kin.moonSky, ctx.target === "moon");
  }

  return occulters;
}

function evenlySpacedIndices(indices: number[], limit: number): number[] {
  if (indices.length <= limit) return indices;
  if (limit === 1) return [indices[Math.floor((indices.length - 1) / 2)]];

  return Array.from({ length: limit }, (_, index) => {
    const sourceIndex = Math.round((index * (indices.length - 1)) / (limit - 1));
    return indices[sourceIndex];
  });
}

function positiveLambdaGrid(lambdaRaw: unknown, limit = MAX_SPECTRAL_SAMPLES): LambdaGrid | null {
  if (!Array.isArray(lambdaRaw)) return null;

  const validIndices: number[] = [];
  for (let i = 0; i < lambdaRaw.length; i++) {
    const x = lambdaRaw[i];
    if (isFinitePositive(x)) {
      validIndices.push(i);
      if (validIndices.length >= MAX_SPECTRAL_SAMPLES) break;
    }
  }
  if (validIndices.length === 0) return null;

  const keepIdx = evenlySpacedIndices(validIndices, Math.max(1, Math.floor(limit)));
  const lambdaNm = keepIdx.map((index) => lambdaRaw[index] as number);
  return { lambdaNm, keepIdx, rawLength: lambdaRaw.length };
}

function sanitizedTauScale(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 1;
  return Math.max(0, value);
}

function legacyTauScale(lambdaGrid: LambdaGrid, tauRaw: number[] | undefined): number[] {
  if (!Array.isArray(tauRaw)) return lambdaGrid.lambdaNm.map(() => 1);

  if (tauRaw.length === 1 && Number.isFinite(tauRaw[0])) {
    return lambdaGrid.lambdaNm.map(() => Math.max(0, tauRaw[0]));
  }

  if (tauRaw.length === lambdaGrid.rawLength) {
    return lambdaGrid.keepIdx.map((idx) => sanitizedTauScale(tauRaw[idx]));
  }

  if (tauRaw.length === lambdaGrid.lambdaNm.length) {
    return tauRaw.map((value) => sanitizedTauScale(value));
  }

  return lambdaGrid.lambdaNm.map(() => 1);
}

function normalizeLegacySpectralGrid(
  atm: AtmosphereTransmissionConfig | undefined,
  sampleLimit: number,
): SpectralGrid | null {
  const lambdaGrid = positiveLambdaGrid(atm?.lambdaNm, sampleLimit);
  if (!lambdaGrid) return null;

  const tauScale = legacyTauScale(lambdaGrid, atm?.tauScale);
  const weights = lambdaGrid.lambdaNm.map(() => 1 / lambdaGrid.lambdaNm.length);
  return { lambdaNm: lambdaGrid.lambdaNm, weights, tauScale };
}

function sanitizedPositiveWeights(weights: number[], lambdaGrid: LambdaGrid): number[] {
  if (weights.length === lambdaGrid.rawLength) {
    return lambdaGrid.keepIdx.map((index) => {
      const weight = weights[index];
      return Number.isFinite(weight) && weight > 0 ? weight : 0;
    });
  }

  if (weights.length === lambdaGrid.lambdaNm.length) {
    return weights.map((weight) => (Number.isFinite(weight) && weight > 0 ? weight : 0));
  }

  return lambdaGrid.lambdaNm.map(() => 1);
}

function contaminatedWeights(lambdaNm: number[], weights: number[], phot: StarPhotometry): number[] {
  return weights.map(
    (weight, index) =>
      weight * spectralContaminationWeight({ lambdaNm: lambdaNm[index], config: phot?.atmosphereRT }),
  );
}

function normalizedWeights(lambdaNm: number[], weights: number[]): number[] {
  const sumW = weights.reduce((a, b) => a + b, 0);
  if (sumW > 0) return weights.map((weight) => weight / sumW);
  return lambdaNm.map(() => 1 / lambdaNm.length);
}

function normalizeBandpassSpectralGrid(phot: StarPhotometry, sampleLimit: number): SpectralGrid | null {
  const bp = phot?.spectralBandpass;
  if (!bp?.enabled) return null;

  const lambdaGrid = positiveLambdaGrid(bp.lambdaNm, sampleLimit);
  if (!lambdaGrid) return null;

  const rawWeights = Array.isArray(bp.weights) ? bp.weights : [];
  const weightsRaw = sanitizedPositiveWeights(rawWeights, lambdaGrid);
  const weights = normalizedWeights(
    lambdaGrid.lambdaNm,
    contaminatedWeights(lambdaGrid.lambdaNm, weightsRaw, phot),
  );
  return { lambdaNm: lambdaGrid.lambdaNm, weights, tauScale: lambdaGrid.lambdaNm.map(() => 1) };
}

function normalizeBandpassGrid(phot: StarPhotometry, gridRes: number | undefined): SpectralGrid | null {
  const sampleLimit = maxSpectralSamplesForGrid(gridRes, 256);
  return (
    normalizeBandpassSpectralGrid(phot, sampleLimit) ??
    normalizeLegacySpectralGrid(phot?.atmosphereTransmission, sampleLimit)
  );
}

function assertStarRadius(params: SystemParams): number {
  const rStar = params.star?.r;
  if (!isFinitePositive(rStar)) {
    throw new Error("computeTransitFlux: params.star.r must be a positive finite number.");
  }
  return rStar;
}

function transitFluxInputs(
  params: SystemParams,
  occulters: OcculterShape[],
  kin: BodyKinematics,
  opts?: { brightnessPatchesOverride?: BrightnessPatch[] },
): TransitFluxInputs {
  const rStar = assertStarRadius(params);
  const phot = params.star.photometry;
  const patches = opts?.brightnessPatchesOverride ?? phot?.brightnessPatches;
  const frontVisibleOcculters = filterFrontVisibleOcculters(occulters, kin);
  const allCircles = frontVisibleOcculters.every(isCircleOcculter);
  return {
    rStar,
    phot,
    patches,
    gridRes: phot?.gridRes,
    frontVisibleOcculters,
    allCircles,
    circleOcculters: allCircles ? (frontVisibleOcculters as CircleOcculter[]) : [],
  };
}

function finiteClampedFlux(value: number): number {
  return clamp01(Number.isFinite(value) ? value : 1.0);
}

function hasBrightnessPatches(patches: BrightnessPatch[] | undefined): patches is BrightnessPatch[] {
  return Array.isArray(patches) && patches.length > 0;
}

function transmissionBandFlux(
  params: SystemParams,
  kin: BodyKinematics,
  inputs: TransitFluxInputs,
  opts: { tauScale?: number; lambdaNm?: number; bandpass?: unknown },
): number {
  const occTrans = buildTransmissionOcculters(params, kin, opts);
  if (occTrans.length === 0) return 1.0;

  const ldLaw = resolveLimbDarkeningLaw(inputs.phot, opts.bandpass);
  return fluxStarWithTransmissiveOcculters({
    rStar: inputs.rStar,
    occulters: occTrans,
    limbDarkening: ldLaw,
    brightnessPatches: inputs.patches,
    gridRes: inputs.gridRes,
    clamp01: true,
  });
}

function computeSpectralTransmissionFlux(
  params: SystemParams,
  kin: BodyKinematics,
  inputs: TransitFluxInputs,
  spectral: SpectralGrid,
): number {
  let sum = 0;
  let wSum = 0;

  for (let i = 0; i < spectral.lambdaNm.length; i++) {
    const lambdaNm = spectral.lambdaNm[i];
    const flux = transmissionBandFlux(params, kin, inputs, {
      tauScale: spectral.tauScale[i],
      lambdaNm,
      bandpass: String(lambdaNm),
    });
    if (!Number.isFinite(flux)) continue;

    const weight = spectral.weights[i];
    sum += flux * weight;
    wSum += weight;
  }

  return wSum > 0 ? clamp01(sum / wSum) : 1.0;
}

const computeSingleTransmissionFlux = (
  params: SystemParams,
  kin: BodyKinematics,
  inputs: TransitFluxInputs,
): number => {
  return finiteClampedFlux(transmissionBandFlux(params, kin, inputs, {}));
};

const computeTransmissionFlux = (
  params: SystemParams,
  kin: BodyKinematics,
  inputs: TransitFluxInputs,
): number | undefined => {
  if (!activeAtmosphereTransmission(params, inputs.phot)) return undefined;
  if (!inputs.allCircles) return undefined;

  const spectral = normalizeBandpassGrid(inputs.phot, inputs.gridRes);
  if (spectral) return computeSpectralTransmissionFlux(params, kin, inputs, spectral);
  return computeSingleTransmissionFlux(params, kin, inputs);
};

const warnUnsupportedTransmission = (params: SystemParams, inputs: TransitFluxInputs): void => {
  if (!activeAtmosphereTransmission(params, inputs.phot)) return;
  if (inputs.allCircles) return;

  console.warn(
    "[computeTransitFlux] atmosphere transmission currently applies only to circular occulters; falling back to the non-transmissive mixed-shape solver.",
  );
};

const computeOptionalCircleLdFlux = (inputs: TransitFluxInputs): number | undefined => {
  const ldModel = inputs.phot?.limbDarkeningModel;
  const ld = getLdIntegrators();
  if (!ldModel || !ld) return undefined;

  try {
    const ldLaw = ld.resolveLimbDarkeningForBand(ldModel, ldModel.bandpass);
    if (!ldLaw) return undefined;
    return finiteClampedFlux(
      ld.fluxLimbDarkenedDisk({
        rStar: inputs.rStar,
        rOcculters: inputs.circleOcculters,
        limbDarkeningLaw: ldLaw,
        constraints: ldModel.constraints,
        brightnessPatches: inputs.patches,
        gridRes: inputs.gridRes,
      }),
    );
  } catch {
    // LD module error; fall through to uniform-disk path (deliberate fail-open).
    return undefined;
  }
};

const computeCircleFlux = (inputs: TransitFluxInputs): number => {
  const ldFlux = computeOptionalCircleLdFlux(inputs);
  if (ldFlux !== undefined) return ldFlux;

  if (hasBrightnessPatches(inputs.patches)) {
    return finiteClampedFlux(
      fluxUniformDiskWithPatches({
        rStar: inputs.rStar,
        rOcculters: inputs.circleOcculters,
        brightnessPatches: inputs.patches,
        gridRes: inputs.gridRes,
      }),
    );
  }

  return finiteClampedFlux(
    fluxUniformDisk({ rStar: inputs.rStar, rOcculters: inputs.circleOcculters, gridRes: inputs.gridRes }),
  );
};

const computeOptionalMixedLdFlux = (inputs: TransitFluxInputs): number | undefined => {
  const ldModel = inputs.phot?.limbDarkeningModel;
  if (!ldModel) return undefined;

  try {
    const ldLaw = resolveLimbDarkeningForBand(ldModel, ldModel.bandpass);
    if (!ldLaw) return undefined;
    return finiteClampedFlux(
      fluxLimbDarkenedDiskShapes({
        rStar: inputs.rStar,
        occulters: inputs.frontVisibleOcculters,
        limbDarkeningLaw: ldLaw,
        constraints: ldModel.constraints,
        brightnessPatches: inputs.patches,
        gridRes: inputs.gridRes,
      }),
    );
  } catch {
    // LD module error; fall through to uniform-disk path for mixed shapes (deliberate fail-open).
    return undefined;
  }
};

const computeMixedShapeFlux = (inputs: TransitFluxInputs): number => {
  const ldFlux = computeOptionalMixedLdFlux(inputs);
  if (ldFlux !== undefined) return ldFlux;

  if (hasBrightnessPatches(inputs.patches)) {
    return finiteClampedFlux(
      fluxUniformDiskWithPatchesShapes({
        rStar: inputs.rStar,
        occulters: inputs.frontVisibleOcculters,
        brightnessPatches: inputs.patches,
        gridRes: inputs.gridRes,
      }),
    );
  }

  return finiteClampedFlux(
    fluxUniformDiskShapes({
      rStar: inputs.rStar,
      occulters: inputs.frontVisibleOcculters,
      gridRes: inputs.gridRes,
    }),
  );
};

/**
 * Compute the multiplicative stellar transit attenuation factor F_transit in [0, 1].
 *
 * Policy chain (first match wins):
 * 1. Atmosphere transmission enabled → transmissive grid integrator
 * 2. Limb-darkening model + optional LD integrators → LD disk integrator
 * 3. Brightness patches → patched uniform-disk integrator
 * 4. Default → uniform-disk integrator
 *
 * Always clamps output to [0, 1] and fails open to 1.0 on non-finite results.
 *
 * @param params System configuration with star radius and photometry settings.
 * @param occulters Sky-plane occulter geometries (circles, ellipses, rings).
 * @param kin Body kinematics for atmosphere transmission geometry.
 * @param opts Optional brightness patch override.
 * @returns Transit flux factor in [0, 1] where 1.0 = no dimming.
 */
export function computeTransitFlux(
  params: SystemParams,
  occulters: OcculterShape[],
  kin: BodyKinematics,
  opts?: { brightnessPatchesOverride?: BrightnessPatch[] },
): number {
  const inputs = transitFluxInputs(params, occulters, kin, opts);
  const transmissionFlux = computeTransmissionFlux(params, kin, inputs);
  if (transmissionFlux !== undefined) return transmissionFlux;

  warnUnsupportedTransmission(params, inputs);
  return inputs.allCircles ? computeCircleFlux(inputs) : computeMixedShapeFlux(inputs);
}
