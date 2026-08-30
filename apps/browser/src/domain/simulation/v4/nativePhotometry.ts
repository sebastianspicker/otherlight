/**
 * Owns native Photometry support within the sim layer. Keeps simulation state and numerical execution separate from UI coordination.
 */
import { clamp01, clamp11 } from "../../model/units";
import type { CircleOcculter } from "../../photometry/occulterCircle";
import {
  effectiveCircleAtmosphereOpacity,
  spectralContaminationWeight,
  totalAtmosphereTransmission,
} from "../../photometry/atmosphereRT/model";
import { resolveAndValidateLimbDarkeningForStar } from "../../photometry/limbDarkening";
import { fluxLimbDarkenedDiskDetailed } from "../../photometry/transitLimbDarkened";
import { fluxStarWithTransmissiveOcculters } from "../../photometry/transitTransmission";
import type { EducationScenarioV4, StarBodyV4 } from "./types";

/** Buffer factor for the outer shell boundary in atmosphere ray-tracing; ensures numerical separation from the body surface. */
const SHELL_OUTER_BUFFER_FACTOR = 1.000001;

export type WeightedPhotometryBand = {
  lambdaNm: number;
  weight: number;
  legacyTauScale: number;
};

type LegacyTransmissionGrid = {
  lambdaNm: number[];
  tauScale: number[];
};

type PositiveWavelengthGrid = {
  keepIdx: number[];
  lambdaNm: number[];
  rawLength: number;
};

type VisibilityStar = {
  kind: "star" | "planet" | "moon";
  r: number;
  sky: { x: number; y: number; z: number };
  source: StarBodyV4 | unknown;
};

type VisibilityOcculter = {
  r: number;
  sky: { x: number; y: number; z: number };
  opacity?: number;
  transmissionAtRadius?: (rho: number) => number;
};

const isFinitePositive = (x: unknown): x is number => {
  return typeof x === "number" && Number.isFinite(x) && x > 0;
};

const sampledAtmosphereTransmission = (
  bodyRadius: number,
  outerRadius: number,
  evaluateShell: (rho: number) => number,
): ((rho: number) => number) => {
  const count = 256;
  const width = outerRadius - bodyRadius;
  if (!(width > 0)) return (rho) => (rho <= bodyRadius ? 0 : 1);
  const values = Array.from({ length: count + 1 }, (_, index) =>
    clamp01(evaluateShell(bodyRadius + (width * index) / count)),
  );
  return (rho) => {
    if (rho <= bodyRadius) return 0;
    if (rho >= outerRadius) return 1;
    const coordinate = ((rho - bodyRadius) / width) * count;
    const lower = Math.floor(coordinate);
    const fraction = coordinate - lower;
    return values[lower] * (1 - fraction) + values[lower + 1] * fraction;
  };
};

const normalizeLegacyTransmissionGrid = (config: EducationScenarioV4): LegacyTransmissionGrid | null => {
  const atm = config.photometry?.atmosphereTransmission;
  if (!atm?.enabled || !Array.isArray(atm.lambdaNm) || atm.lambdaNm.length === 0) return null;

  const wavelengths = positiveWavelengthGrid(atm.lambdaNm);
  if (!wavelengths) return null;

  return {
    lambdaNm: wavelengths.lambdaNm,
    tauScale: normalizeLegacyTauScale(atm.tauScale, wavelengths),
  };
};

const positiveWavelengthGrid = (lambdaRaw: unknown[]): PositiveWavelengthGrid | null => {
  const keepIdx: number[] = [];
  const lambdaNm: number[] = [];
  for (let idx = 0; idx < lambdaRaw.length; idx++) {
    const value = lambdaRaw[idx];
    if (!isFinitePositive(value)) continue;
    keepIdx.push(idx);
    lambdaNm.push(value);
  }
  return lambdaNm.length > 0 ? { keepIdx, lambdaNm, rawLength: lambdaRaw.length } : null;
};

const normalizeLegacyTauScale = (rawTauScale: unknown, wavelengths: PositiveWavelengthGrid): number[] => {
  const tauRaw = Array.isArray(rawTauScale) ? rawTauScale : [];
  if (tauRaw.length === 1 && Number.isFinite(tauRaw[0])) {
    return wavelengths.lambdaNm.map(() => Math.max(0, tauRaw[0] as number));
  }
  if (tauRaw.length === wavelengths.rawLength) {
    return wavelengths.keepIdx.map((idx) => finiteNonNegativeOrOne(tauRaw[idx]));
  }
  if (tauRaw.length === wavelengths.lambdaNm.length) {
    return tauRaw.map(finiteNonNegativeOrOne);
  }
  return wavelengths.lambdaNm.map(() => 1);
};

const finiteNonNegativeOrOne = (value: unknown): number => {
  return Number.isFinite(value) ? Math.max(0, value as number) : 1;
};

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

const resolveSpectralBandpassBands = (
  config: EducationScenarioV4,
  legacy: LegacyTransmissionGrid | null,
): WeightedPhotometryBand[] | undefined => {
  const phot = config.photometry;
  const bandpass = phot?.spectralBandpass;
  const lambdaNm = enabledBandpassWavelengths(bandpass);
  if (!lambdaNm) return undefined;

  const rawWeights = bandpassWeights(bandpass?.weights, lambdaNm);
  const legacyTauScale = legacyTauScaleForBands(legacy, lambdaNm);
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
  if (!bandpass?.enabled || !Array.isArray(bandpass.lambdaNm) || bandpass.lambdaNm.length === 0) {
    return undefined;
  }
  const lambdaNm = bandpass.lambdaNm.filter((value) => isFinitePositive(value));
  return lambdaNm.length > 0 ? lambdaNm : undefined;
};

const bandpassWeights = (rawWeights: unknown, lambdaNm: number[]): unknown[] => {
  return Array.isArray(rawWeights) && rawWeights.length === lambdaNm.length
    ? rawWeights
    : lambdaNm.map(() => 1);
};

const legacyTauScaleForBands = (legacy: LegacyTransmissionGrid | null, lambdaNm: number[]): number[] => {
  return legacy && legacy.lambdaNm.length === lambdaNm.length ? legacy.tauScale : lambdaNm.map(() => 1);
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
  const sum = weighted.reduce((acc, value) => acc + value, 0);
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

const legacyTransmissionAtRadius = (args: {
  rho: number;
  bodyRadius: number;
  r0: number;
  H: number;
  tau0: number;
  tauScale: number;
  kind?: "hard" | "exponential-halo" | "custom";
}): number => {
  const rho = args.rho;
  if (!(Number.isFinite(rho) && rho >= 0)) return 1;
  const r0 = isFinitePositive(args.r0) ? args.r0 : args.bodyRadius;
  if (!(Number.isFinite(r0) && r0 > 0)) return 1;
  const boundaryTransmission = legacyBoundaryTransmission(args, r0);
  if (boundaryTransmission !== undefined) return boundaryTransmission;

  const tau = legacyTransmissionTau(args, r0);
  return tau > 0 ? Math.exp(-Math.max(0, Math.min(60, tau))) : 1;
};

const legacyBoundaryTransmission = (
  args: { rho: number; kind?: "hard" | "exponential-halo" | "custom" },
  r0: number,
): number | undefined => {
  if (!(args.rho > r0)) return 0;
  if (args.kind === "hard") return 1;
  return undefined;
};

const legacyTransmissionTau = (
  args: {
    rho: number;
    H: number;
    tau0: number;
    tauScale: number;
  },
  r0: number,
): number => {
  const H = isFinitePositive(args.H) ? args.H : 0;
  const tau0 = Number.isFinite(args.tau0) ? Math.max(0, args.tau0) : 0;
  const tauScale = Number.isFinite(args.tauScale) ? Math.max(0, args.tauScale) : 1;
  return H > 0 && tau0 > 0 ? tau0 * tauScale * Math.exp(-(args.rho - r0) / H) : 0;
};

const effectiveLegacyTransmissionOpacity = (args: {
  bodyRadius: number;
  config: NonNullable<EducationScenarioV4["photometry"]>["atmosphereTransmission"];
  tauScale: number;
}): number => {
  const transmission = args.config;
  if (!transmission?.enabled) return 1;
  const r0 = isFinitePositive(transmission.r0) ? transmission.r0 : args.bodyRadius;
  if (!(Number.isFinite(r0) && r0 > 0)) return 1;

  const H = isFinitePositive(transmission.H) ? transmission.H : 0;
  const inner = Math.max(args.bodyRadius, r0);
  const outer = Math.max(inner * SHELL_OUTER_BUFFER_FACTOR, inner + Math.max(args.bodyRadius * 0.25, H * 6));
  const averageTransmission = averageLegacyShellTransmission(args, { r0, H, inner, outer });

  return clamp01(1 - averageTransmission);
};

const averageLegacyShellTransmission = (
  args: {
    bodyRadius: number;
    config: NonNullable<EducationScenarioV4["photometry"]>["atmosphereTransmission"];
    tauScale: number;
  },
  shell: { r0: number; H: number; inner: number; outer: number },
): number => {
  const radialSamples = 24;
  let weightedTransmission = 0;
  let weightSum = 0;
  for (let i = 0; i < radialSamples; i++) {
    const t0 = i / radialSamples;
    const t1 = (i + 1) / radialSamples;
    const rhoLo = shell.inner + (shell.outer - shell.inner) * t0;
    const rhoHi = shell.inner + (shell.outer - shell.inner) * t1;
    const rhoMid = 0.5 * (rhoLo + rhoHi);
    const annulusWeight = Math.max(0, rhoHi * rhoHi - rhoLo * rhoLo);
    const pointTransmission = legacyTransmissionAtRadius({
      rho: rhoMid,
      bodyRadius: args.bodyRadius,
      r0: shell.r0,
      H: args.config?.H ?? 0,
      tau0: args.config?.tau0 ?? 0,
      tauScale: args.tauScale,
      kind: args.config?.kind,
    });
    weightedTransmission += pointTransmission * annulusWeight;
    weightSum += annulusWeight;
  }

  return weightSum > 0 ? weightedTransmission / weightSum : fallbackLegacyShellTransmission(args, shell);
};

const fallbackLegacyShellTransmission = (
  args: {
    bodyRadius: number;
    config: NonNullable<EducationScenarioV4["photometry"]>["atmosphereTransmission"];
    tauScale: number;
  },
  shell: { r0: number; inner: number },
): number => {
  return legacyTransmissionAtRadius({
    rho: shell.inner * SHELL_OUTER_BUFFER_FACTOR,
    bodyRadius: args.bodyRadius,
    r0: shell.r0,
    H: args.config?.H ?? 0,
    tau0: args.config?.tau0 ?? 0,
    tauScale: args.tauScale,
    kind: args.config?.kind,
  });
};

export function circleOverlapArea(r1: number, r2: number, d: number): number {
  if (!hasCircleOverlapInputs(r1, r2, d)) return 0;
  if (d >= r1 + r2) return 0;
  if (d <= Math.abs(r1 - r2)) {
    const rMin = Math.min(r1, r2);
    return Math.PI * rMin * rMin;
  }
  const x = (d * d + r1 * r1 - r2 * r2) / (2 * d);
  const y2 = Math.max(0, r1 * r1 - x * x);
  const y = Math.sqrt(y2);
  const a1 = Math.acos(clamp11(x / r1));
  const a2 = Math.acos(clamp11((d - x) / r2));
  return r1 * r1 * a1 + r2 * r2 * a2 - d * y;
}

const hasCircleOverlapInputs = (r1: number, r2: number, d: number): boolean => {
  return Number.isFinite(r1) && r1 > 0 && Number.isFinite(r2) && r2 > 0 && Number.isFinite(d) && d >= 0;
};

export function atmosphereOpacityForOcculter(
  config: EducationScenarioV4,
  body: { kind: "star" | "planet" | "moon"; r: number },
): number {
  const target = atmosphereTargetForBody(body.kind);
  if (!target) return 1;

  const bands = resolveWeightedPhotometryBands(config);
  const rtOpacity = atmosphereRtOpacityForTarget(config, body.r, target, bands);
  if (rtOpacity !== undefined) return rtOpacity;

  return legacyAtmosphereOpacityForTarget(config, body.r, target, bands);
}

/**
 * Build the actual radial transmission profile used by the native V4 transit
 * integrator. The solid body is always opaque; an atmosphere only extends the
 * occulting cross-section beyond that core.
 */
type PhotometricBody = {
  kind: "star" | "planet" | "moon";
  r: number;
  sky: { x: number; y: number; z: number };
};

const rtPhotometricOcculter = (
  config: EducationScenarioV4,
  body: PhotometricBody,
  target: "planet" | "moon",
  bands: ReturnType<typeof resolveWeightedPhotometryBands>,
): VisibilityOcculter | undefined => {
  const rt = config.photometry?.atmosphereRT;
  if (!(rt?.enabled && rt.target === target && Array.isArray(rt.layers) && rt.layers.length > 0))
    return undefined;
  const validLayers = rt.layers.filter(
    (layer) =>
      layer.r0 > 0 && layer.H > 0 && layer.tau0 >= 0 && Number.isFinite(layer.r0 + layer.H + layer.tau0),
  );
  if (validLayers.length === 0) return undefined;
  const outer = Math.max(body.r, ...validLayers.map((layer) => layer.r0 + 6 * layer.H));
  const profile = { ...rt, layers: validLayers };
  return {
    r: outer,
    sky: body.sky,
    transmissionAtRadius: sampledAtmosphereTransmission(body.r, outer, (rho) =>
      bands.reduce(
        (sum, band) =>
          sum + band.weight * totalAtmosphereTransmission({ rho, config: profile, lambdaNm: band.lambdaNm }),
        0,
      ),
    ),
  };
};

const legacyPhotometricOcculter = (
  config: EducationScenarioV4,
  body: PhotometricBody,
  target: "planet" | "moon",
  bands: ReturnType<typeof resolveWeightedPhotometryBands>,
): VisibilityOcculter | undefined => {
  const legacy = config.photometry?.atmosphereTransmission;
  if (!(legacy?.enabled && legacy.target === target)) return undefined;
  const r0 = isFinitePositive(legacy.r0) ? legacy.r0 : body.r;
  const H = isFinitePositive(legacy.H) ? legacy.H : 0;
  const outer = Math.max(body.r, r0 + 6 * H);
  return {
    r: outer,
    sky: body.sky,
    transmissionAtRadius: sampledAtmosphereTransmission(body.r, outer, (rho) =>
      bands.reduce(
        (sum, band) =>
          sum +
          band.weight *
            legacyTransmissionAtRadius({
              rho,
              bodyRadius: body.r,
              r0,
              H,
              tau0: legacy.tau0 ?? 0,
              tauScale: band.legacyTauScale,
              kind: legacy.kind,
            }),
        0,
      ),
    ),
  };
};

export function photometricOcculterForBody(
  config: EducationScenarioV4,
  body: PhotometricBody,
): VisibilityOcculter {
  const target = atmosphereTargetForBody(body.kind);
  if (!target) return { r: body.r, sky: body.sky, opacity: 1 };
  const bands = resolveWeightedPhotometryBands(config);
  return (
    rtPhotometricOcculter(config, body, target, bands) ??
    legacyPhotometricOcculter(config, body, target, bands) ?? { r: body.r, sky: body.sky, opacity: 1 }
  );
}

const atmosphereTargetForBody = (kind: "star" | "planet" | "moon"): "planet" | "moon" | undefined => {
  if (kind === "moon") return "moon";
  if (kind === "planet") return "planet";
  return undefined;
};

const atmosphereRtOpacityForTarget = (
  config: EducationScenarioV4,
  bodyRadius: number,
  target: "planet" | "moon",
  bands: WeightedPhotometryBand[],
): number | undefined => {
  const rt = config.photometry?.atmosphereRT;
  if (rt?.enabled && Array.isArray(rt.layers) && rt.layers.length > 0 && rt.target === target) {
    let weightedOpacity = 0;
    for (const band of bands) {
      weightedOpacity +=
        band.weight *
        effectiveCircleAtmosphereOpacity({
          bodyRadius,
          lambdaNm: band.lambdaNm,
          config: {
            ...rt,
            layers: rt.layers,
          },
        });
    }
    return clamp01(weightedOpacity);
  }
  return undefined;
};

const legacyAtmosphereOpacityForTarget = (
  config: EducationScenarioV4,
  bodyRadius: number,
  target: "planet" | "moon",
  bands: WeightedPhotometryBand[],
): number => {
  const transmission = config.photometry?.atmosphereTransmission;
  if (!transmission?.enabled || transmission.target !== target) return 1;

  let weightedOpacity = 0;
  for (const band of bands) {
    weightedOpacity +=
      band.weight *
      effectiveLegacyTransmissionOpacity({
        bodyRadius,
        config: transmission,
        tauScale: band.legacyTauScale,
      });
  }
  return clamp01(weightedOpacity);
};

export function gaussianPhaseWeight(phase: number, sigma: number): number {
  const d = Math.atan2(Math.sin(phase), Math.cos(phase));
  const s = Math.max(1e-6, sigma);
  return Math.exp(-(d * d) / (2 * s * s));
}

export function starVisibilityFromOpaqueOcculters(
  config: EducationScenarioV4,
  star: VisibilityStar,
  occulters: Array<{ r: number; sky: { x: number; y: number; z: number } }>,
): number {
  return starVisibilityFromOcculters(
    config,
    star,
    occulters.map((oc) => ({ ...oc, opacity: 1 })),
  );
}

export function starVisibilityFromOcculters(
  config: EducationScenarioV4,
  star: VisibilityStar,
  occulters: VisibilityOcculter[],
): number {
  if (!(star.r > 0) || occulters.length === 0) return 1;

  const circles = circleOccultersForStar(star, occulters);
  const opacities = occulters.map(occulterOpacity);
  const allOpaque = occulters.every((oc, index) => !oc.transmissionAtRadius && opacities[index] >= 1 - 1e-12);
  const ldLaw = resolveStarLimbDarkeningLaw(config, star);

  if (ldLaw && allOpaque) {
    return fluxLimbDarkenedDiskDetailed({
      rStar: star.r,
      rOcculters: circles,
      limbDarkeningLaw: ldLaw,
      gridRes: config.photometry?.gridRes,
    }).flux;
  }

  return fluxStarWithTransmissiveOcculters({
    rStar: star.r,
    occulters: occulters.map((oc, index) => ({
      dx: oc.sky.x - star.sky.x,
      dy: oc.sky.y - star.sky.y,
      r0: oc.r,
      transmission: oc.transmissionAtRadius ?? ((rho) => (rho <= oc.r ? 1 - opacities[index] : 1)),
    })),
    limbDarkening: ldLaw,
    gridRes: config.photometry?.gridRes,
  });
}

const circleOccultersForStar = (star: VisibilityStar, occulters: VisibilityOcculter[]): CircleOcculter[] => {
  return occulters.map((oc) => ({
    dx: oc.sky.x - star.sky.x,
    dy: oc.sky.y - star.sky.y,
    r: oc.r,
  }));
};

const occulterOpacity = (oc: VisibilityOcculter): number => {
  return clamp01(Number.isFinite(oc.opacity) ? (oc.opacity as number) : 1);
};

const resolveStarLimbDarkeningLaw = (config: EducationScenarioV4, star: VisibilityStar) => {
  const ldModel = config.photometry?.limbDarkeningModel;
  if (!ldModel) return undefined;
  const stellarSource = star.kind === "star" ? (star.source as StarBodyV4) : undefined;
  return resolveAndValidateLimbDarkeningForStar({
    model: ldModel,
    star: stellarSource
      ? {
          teffK: stellarSource.teffK,
          loggCgs: stellarSource.loggCgs,
          metallicityDex: stellarSource.metallicityDex,
          bandpass: stellarSource.passband,
        }
      : undefined,
  });
};
