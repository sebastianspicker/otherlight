import { clamp01, clamp11 } from "../../core/units";
import type { CircleOcculter } from "../../photometry/occulterCircle";
import {
  effectiveCircleAtmosphereOpacity,
  spectralContaminationWeight,
} from "../../photometry/atmosphereRT/model";
import { resolveAndValidateLimbDarkeningForStar } from "../../photometry/limbDarkening";
import { fluxLimbDarkenedDiskDetailed } from "../../photometry/transitLimbDarkened";
import type { SimulationConfigV4, StarBodyV4 } from "./types";

export type WeightedPhotometryBand = {
  lambdaNm: number;
  weight: number;
  legacyTauScale: number;
};

function isFinitePositive(x: unknown): x is number {
  return typeof x === "number" && Number.isFinite(x) && x > 0;
}

function normalizeLegacyTransmissionGrid(config: SimulationConfigV4): {
  lambdaNm: number[];
  tauScale: number[];
} | null {
  const atm = config.photometry?.atmosphereTransmission;
  if (!atm?.enabled || !Array.isArray(atm.lambdaNm) || atm.lambdaNm.length === 0) return null;

  const lambdaRaw = atm.lambdaNm;
  const keepIdx: number[] = [];
  const lambdaNm: number[] = [];
  for (let idx = 0; idx < lambdaRaw.length; idx++) {
    const value = lambdaRaw[idx];
    if (!isFinitePositive(value)) continue;
    keepIdx.push(idx);
    lambdaNm.push(value);
  }
  if (lambdaNm.length === 0) return null;

  const tauRaw = Array.isArray(atm.tauScale) ? atm.tauScale : [];
  const tauScale =
    tauRaw.length === 1 && Number.isFinite(tauRaw[0])
      ? lambdaNm.map(() => Math.max(0, tauRaw[0] as number))
      : tauRaw.length === lambdaRaw.length
        ? keepIdx.map((idx) => {
            const value = tauRaw[idx];
            return Number.isFinite(value) ? Math.max(0, value) : 1;
          })
        : tauRaw.length === lambdaNm.length
          ? tauRaw.map((value) => (Number.isFinite(value) ? Math.max(0, value) : 1))
          : lambdaNm.map(() => 1);

  return { lambdaNm, tauScale };
}

export function resolveWeightedPhotometryBands(config: SimulationConfigV4): WeightedPhotometryBand[] {
  const phot = config.photometry;
  const bandpass = phot?.spectralBandpass;
  const legacy = normalizeLegacyTransmissionGrid(config);

  if (bandpass?.enabled && Array.isArray(bandpass.lambdaNm) && bandpass.lambdaNm.length > 0) {
    const lambdaNm = bandpass.lambdaNm.filter((value) => isFinitePositive(value));
    if (lambdaNm.length > 0) {
      const rawWeights =
        Array.isArray(bandpass.weights) && bandpass.weights.length === lambdaNm.length
          ? bandpass.weights
          : lambdaNm.map(() => 1);
      const legacyTauScale =
        legacy && legacy.lambdaNm.length === lambdaNm.length ? legacy.tauScale : lambdaNm.map(() => 1);
      const weighted = rawWeights.map((value, index) => {
        const base = Number.isFinite(value) && value > 0 ? value : 0;
        return base * spectralContaminationWeight({ lambdaNm: lambdaNm[index], config: phot?.atmosphereRT });
      });
      const sum = weighted.reduce((acc, value) => acc + value, 0);
      const normalized =
        sum > 0 ? weighted.map((value) => value / sum) : lambdaNm.map(() => 1 / lambdaNm.length);
      return lambdaNm.map((value, index) => ({
        lambdaNm: value,
        weight: normalized[index],
        legacyTauScale: legacyTauScale[index] ?? 1,
      }));
    }
  }

  if (legacy) {
    const weight = 1 / legacy.lambdaNm.length;
    return legacy.lambdaNm.map((value, index) => ({
      lambdaNm: value,
      weight,
      legacyTauScale: legacy.tauScale[index] ?? 1,
    }));
  }

  const lambdaNm = isFinitePositive(phot?.atmosphereRT?.lambdaRefNm)
    ? (phot?.atmosphereRT?.lambdaRefNm as number)
    : 550;
  return [{ lambdaNm, weight: 1, legacyTauScale: 1 }];
}

function legacyTransmissionAtRadius(args: {
  rho: number;
  bodyRadius: number;
  r0: number;
  H: number;
  tau0: number;
  tauScale: number;
  kind?: "hard" | "exponential-halo" | "custom";
}): number {
  const rho = args.rho;
  if (!(Number.isFinite(rho) && rho >= 0)) return 1;
  const r0 = isFinitePositive(args.r0) ? args.r0 : args.bodyRadius;
  if (!(Number.isFinite(r0) && r0 > 0)) return 1;
  if (!(rho > r0)) return 0;

  if (args.kind === "hard") return 1;

  const H = isFinitePositive(args.H) ? args.H : 0;
  const tau0 = Number.isFinite(args.tau0) ? Math.max(0, args.tau0) : 0;
  const tauScale = Number.isFinite(args.tauScale) ? Math.max(0, args.tauScale) : 1;
  if (!(H > 0) || !(tau0 > 0)) return 1;
  const tau = tau0 * tauScale * Math.exp(-(rho - r0) / H);
  return Math.exp(-Math.max(0, Math.min(60, tau)));
}

function effectiveLegacyTransmissionOpacity(args: {
  bodyRadius: number;
  config: NonNullable<SimulationConfigV4["photometry"]>["atmosphereTransmission"];
  tauScale: number;
}): number {
  const transmission = args.config;
  if (!transmission?.enabled) return 1;
  const r0 = isFinitePositive(transmission.r0) ? transmission.r0 : args.bodyRadius;
  if (!(Number.isFinite(r0) && r0 > 0)) return 1;

  const H = isFinitePositive(transmission.H) ? transmission.H : 0;
  const radialSamples = 24;
  const inner = Math.max(args.bodyRadius, r0);
  const outer = Math.max(inner * 1.000001, inner + Math.max(args.bodyRadius * 0.25, H * 6));

  let weightedTransmission = 0;
  let weightSum = 0;
  for (let i = 0; i < radialSamples; i++) {
    const t0 = i / radialSamples;
    const t1 = (i + 1) / radialSamples;
    const rhoLo = inner + (outer - inner) * t0;
    const rhoHi = inner + (outer - inner) * t1;
    const rhoMid = 0.5 * (rhoLo + rhoHi);
    const annulusWeight = Math.max(0, rhoHi * rhoHi - rhoLo * rhoLo);
    const pointTransmission = legacyTransmissionAtRadius({
      rho: rhoMid,
      bodyRadius: args.bodyRadius,
      r0,
      H: transmission.H ?? 0,
      tau0: transmission.tau0 ?? 0,
      tauScale: args.tauScale,
      kind: transmission.kind,
    });
    weightedTransmission += pointTransmission * annulusWeight;
    weightSum += annulusWeight;
  }

  if (!(weightSum > 0)) {
    return clamp01(
      1 -
        legacyTransmissionAtRadius({
          rho: inner * 1.000001,
          bodyRadius: args.bodyRadius,
          r0,
          H: transmission.H ?? 0,
          tau0: transmission.tau0 ?? 0,
          tauScale: args.tauScale,
          kind: transmission.kind,
        }),
    );
  }

  return clamp01(1 - weightedTransmission / weightSum);
}

export function circleOverlapArea(r1: number, r2: number, d: number): number {
  if (!(Number.isFinite(r1) && r1 > 0 && Number.isFinite(r2) && r2 > 0 && Number.isFinite(d) && d >= 0))
    return 0;
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

export function atmosphereOpacityForOcculter(
  config: SimulationConfigV4,
  body: { kind: "star" | "planet" | "moon"; r: number },
): number {
  const target = body.kind === "moon" ? "moon" : body.kind === "planet" ? "planet" : undefined;
  if (!target) return 1;

  const bands = resolveWeightedPhotometryBands(config);
  const rt = config.photometry?.atmosphereRT;
  if (rt?.enabled && Array.isArray(rt.layers) && rt.layers.length > 0 && rt.target === target) {
    let weightedOpacity = 0;
    for (const band of bands) {
      weightedOpacity +=
        band.weight *
        effectiveCircleAtmosphereOpacity({
          bodyRadius: body.r,
          lambdaNm: band.lambdaNm,
          config: {
            ...rt,
            layers: rt.layers,
          },
        });
    }
    return clamp01(weightedOpacity);
  }

  const transmission = config.photometry?.atmosphereTransmission;
  if (!transmission?.enabled || transmission.target !== target) return 1;

  let weightedOpacity = 0;
  for (const band of bands) {
    weightedOpacity +=
      band.weight *
      effectiveLegacyTransmissionOpacity({
        bodyRadius: body.r,
        config: transmission,
        tauScale: band.legacyTauScale,
      });
  }
  return clamp01(weightedOpacity);
}

export function gaussianPhaseWeight(phase: number, sigma: number): number {
  const d = Math.atan2(Math.sin(phase), Math.cos(phase));
  const s = Math.max(1e-6, sigma);
  return Math.exp(-(d * d) / (2 * s * s));
}

export function starVisibilityFromOpaqueOcculters(
  config: SimulationConfigV4,
  star: {
    kind: "star" | "planet" | "moon";
    r: number;
    sky: { x: number; y: number; z: number };
    source: StarBodyV4 | unknown;
  },
  occulters: Array<{ r: number; sky: { x: number; y: number; z: number } }>,
): number {
  if (!(star.r > 0) || occulters.length === 0) return 1;

  const circles: CircleOcculter[] = occulters.map((oc) => ({
    dx: oc.sky.x - star.sky.x,
    dy: oc.sky.y - star.sky.y,
    r: oc.r,
  }));

  const ldModel = config.photometry?.limbDarkeningModel;
  const stellarSource = star.kind === "star" ? (star.source as StarBodyV4) : undefined;
  const ldLaw = ldModel
    ? resolveAndValidateLimbDarkeningForStar({
        model: ldModel,
        star: stellarSource
          ? {
              teffK: stellarSource.teffK,
              loggCgs: stellarSource.loggCgs,
              metallicityDex: stellarSource.metallicityDex,
              bandpass: stellarSource.passband,
            }
          : undefined,
      })
    : undefined;

  if (ldLaw) {
    return fluxLimbDarkenedDiskDetailed({
      rStar: star.r,
      rOcculters: circles,
      limbDarkeningLaw: ldLaw,
      gridRes: config.photometry?.gridRes,
    }).flux;
  }

  const areaStar = Math.PI * star.r * star.r;
  let blocked = 0;
  for (const oc of occulters) {
    const d = Math.hypot(oc.sky.x - star.sky.x, oc.sky.y - star.sky.y);
    if (!(d < star.r + oc.r)) continue;
    blocked += circleOverlapArea(star.r, oc.r, d);
  }
  return clamp01(1 - Math.min(1, blocked / areaStar));
}
