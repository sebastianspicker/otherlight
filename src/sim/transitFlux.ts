// src/sim/transitFlux.ts
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
import { totalAtmosphereTransmission } from "../photometry/atmosphereRT/model";
import type { BodyKinematics } from "./kinematics";
import { getLdIntegrators } from "./optionalLimbDarkening";
import { isPhysicsFeatureEnabled } from "./fidelity";

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

function buildTransmissionOcculters(
  params: SystemParams,
  kin: BodyKinematics,
  opts?: { tauScale?: number; lambdaNm?: number },
): TransmissionOcculter[] {
  const phot = params.star.photometry;
  const atm = phot?.atmosphereTransmission;
  const rt = phot?.atmosphereRT;
  if (!atm?.enabled && !rt?.enabled) return [];
  const rStar = params.star?.r;
  if (!isFinitePositive(rStar)) return [];
  const tauScaleSafe = isFiniteNonNegative(opts?.tauScale) ? (opts!.tauScale as number) : 1;
  const lambdaNm = isFinitePositive(opts?.lambdaNm) ? (opts!.lambdaNm as number) : undefined;

  const occulters: TransmissionOcculter[] = [];

  const addBody = (
    body: { r: number },
    sky: { x: number; y: number; z: number } | undefined,
    isTarget: boolean,
  ): void => {
    if (!sky) return;
    if (!(sky.z > 0)) return;
    if (!isFinitePositive(body.r)) return;

    const r0 = body.r;
    const overlapSky = Math.hypot(sky.x, sky.y) < rStar + r0;
    if (!overlapSky) return;
    if (!isTarget) {
      occulters.push({ dx: sky.x, dy: sky.y, r0 });
      return;
    }

    if (rt?.enabled && Array.isArray(rt.layers) && rt.layers.length > 0) {
      const layers = rt.layers.filter(
        (ly) => ly && isFinitePositive(ly.r0) && isFinitePositive(ly.H) && isFiniteNonNegative(ly.tau0),
      );
      if (layers.length === 0) {
        occulters.push({ dx: sky.x, dy: sky.y, r0 });
        return;
      }
      occulters.push({
        dx: sky.x,
        dy: sky.y,
        r0,
        transmission: (rho: number): number => {
          if (!Number.isFinite(rho) || rho < 0) return 1;
          if (rho <= r0) return 0;
          return totalAtmosphereTransmission({
            rho,
            config: {
              ...rt,
              layers,
            },
            lambdaNm,
          });
        },
      });
      return;
    }

    const kind = atm?.kind ?? "hard";
    const r0Override = isTarget && isFinitePositive(atm?.r0) ? (atm!.r0 as number) : undefined;
    const H = isFinitePositive(atm?.H) ? (atm!.H as number) : 0;
    const tau0 = isFiniteNonNegative(atm?.tau0) ? (atm!.tau0 as number) : 0;
    const tau0Scaled = tau0 * tauScaleSafe;
    const core = r0Override ?? r0;
    const transmission =
      kind === "exponential-halo" && H > 0 && tau0Scaled > 0
        ? (rho: number): number => {
            if (!Number.isFinite(rho) || rho < 0) return 1;
            if (rho <= core) return 0;
            const tau = tau0Scaled * Math.exp(-(rho - core) / H);
            return Math.exp(-Math.max(0, tau));
          }
        : undefined;
    occulters.push({ dx: sky.x, dy: sky.y, r0: core, transmission });
  };

  const target = rt?.enabled ? (rt.target ?? "planet") : (atm?.target ?? "planet");
  addBody(params.planet, kin.planetSky, target === "planet");
  if (params.moon && kin.moonSky) addBody(params.moon, kin.moonSky, target === "moon");

  return occulters;
}

function normalizeLegacySpectralGrid(
  atm:
    | {
        lambdaNm?: number[];
        tauScale?: number[];
      }
    | undefined,
): { lambdaNm: number[]; tauScale: number[] } | null {
  const lambdaRaw = Array.isArray(atm?.lambdaNm) ? atm!.lambdaNm : [];
  const keepIdx: number[] = [];
  const lambdaNm: number[] = [];
  for (let i = 0; i < lambdaRaw.length; i++) {
    const x = lambdaRaw[i];
    if (isFinitePositive(x)) {
      keepIdx.push(i);
      lambdaNm.push(x);
    }
  }
  if (lambdaNm.length === 0) return null;

  const tauRaw = Array.isArray(atm?.tauScale) ? atm!.tauScale : [];
  const tauScale =
    tauRaw.length === 1 && Number.isFinite(tauRaw[0])
      ? lambdaNm.map(() => Math.max(0, tauRaw[0]))
      : tauRaw.length === lambdaRaw.length
        ? keepIdx.map((idx) => {
            const v = tauRaw[idx];
            return Number.isFinite(v) ? Math.max(0, v) : 1;
          })
        : tauRaw.length === lambdaNm.length
          ? tauRaw.map((v) => (Number.isFinite(v) ? Math.max(0, v) : 1))
          : lambdaNm.map(() => 1);

  return { lambdaNm, tauScale };
}

function normalizeBandpassGrid(phot: SystemParams["star"]["photometry"] | undefined): {
  lambdaNm: number[];
  weights: number[];
  tauScale: number[];
} | null {
  const bp = phot?.spectralBandpass;
  if (bp?.enabled && Array.isArray(bp.lambdaNm)) {
    const lambdaNm = bp.lambdaNm.filter((x) => isFinitePositive(x));
    if (lambdaNm.length > 0) {
      const rawWeights = Array.isArray(bp.weights) ? bp.weights : [];
      const weights =
        rawWeights.length === lambdaNm.length
          ? rawWeights.map((w) => (Number.isFinite(w) && w > 0 ? w : 0))
          : lambdaNm.map(() => 1);
      const sumW = weights.reduce((a, b) => a + b, 0);
      const normWeights = sumW > 0 ? weights.map((w) => w / sumW) : lambdaNm.map(() => 1 / lambdaNm.length);
      return { lambdaNm, weights: normWeights, tauScale: lambdaNm.map(() => 1) };
    }
  }

  const legacy = normalizeLegacySpectralGrid(phot?.atmosphereTransmission);
  if (!legacy) return null;
  const weights = legacy.lambdaNm.map(() => 1 / legacy.lambdaNm.length);
  return { lambdaNm: legacy.lambdaNm, weights, tauScale: legacy.tauScale };
}

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
  const rStar = params.star?.r;
  if (!isFinitePositive(rStar)) {
    throw new Error("computeTransitFlux: params.star.r must be a positive finite number.");
  }

  const phot = params.star.photometry;
  const patches = opts?.brightnessPatchesOverride ?? phot?.brightnessPatches;
  const gridRes = phot?.gridRes;
  const allCircles = occulters.every(isCircleOcculter);
  const circleOcculters = allCircles ? (occulters as CircleOcculter[]) : [];

  // Atmosphere transmission: use transmissive integrator when enabled.
  // Transmission integrator only supports circular occulters for now.
  if (
    (phot?.atmosphereTransmission?.enabled ||
      (isPhysicsFeatureEnabled(params, "atmosphereRT") && phot?.atmosphereRT?.enabled)) &&
    allCircles
  ) {
    const spectral = normalizeBandpassGrid(phot);

    if (spectral) {
      let sum = 0;
      let wSum = 0;

      for (let i = 0; i < spectral.lambdaNm.length; i++) {
        const occTrans = buildTransmissionOcculters(params, kin, {
          tauScale: spectral.tauScale[i],
          lambdaNm: spectral.lambdaNm[i],
        });
        if (occTrans.length === 0) {
          // No occulters for this band: flux = 1.0 (no dimming), but continue
          // accumulating the weighted average instead of short-circuiting.
          const w = spectral.weights[i];
          sum += 1.0 * w;
          wSum += w;
          continue;
        }

        const ldLaw = resolveLimbDarkeningLaw(phot, String(spectral.lambdaNm[i]));
        const f = fluxStarWithTransmissiveOcculters({
          rStar,
          occulters: occTrans,
          limbDarkening: ldLaw,
          brightnessPatches: patches,
          gridRes,
          clamp01: true,
        });

        if (Number.isFinite(f)) {
          const w = spectral.weights[i];
          sum += f * w;
          wSum += w;
        }
      }

      return wSum > 0 ? clamp01(sum / wSum) : 1.0;
    }

    const occTrans = buildTransmissionOcculters(params, kin, {});
    if (occTrans.length === 0) return 1.0;

    const ldLaw = resolveLimbDarkeningLaw(phot);
    const f = fluxStarWithTransmissiveOcculters({
      rStar,
      occulters: occTrans,
      limbDarkening: ldLaw,
      brightnessPatches: patches,
      gridRes,
      clamp01: true,
    });

    return clamp01(Number.isFinite(f) ? f : 1.0);
  }

  // Policy: limbDarkeningModel (optional) => use LD integrator if available;
  // otherwise uniform disk, optionally with patches.
  const ldModel = phot?.limbDarkeningModel;
  const ld = getLdIntegrators();

  if (ldModel && ld && allCircles) {
    try {
      // Keep this permissive: limb-darkening model schema is intentionally flexible.
      const ldLaw = ld.resolveLimbDarkeningForBand(ldModel, ldModel.bandpass);

      if (ldLaw) {
        const f = ld.fluxLimbDarkenedDisk({
          rStar,
          rOcculters: circleOcculters,
          limbDarkeningLaw: ldLaw,
          constraints: ldModel.constraints,
          brightnessPatches: patches,
          gridRes,
        });
        return clamp01(Number.isFinite(f) ? f : 1.0);
      }
      // If law resolution fails, fall through to non-LD paths.
    } catch {
      // LD module error; fall through to uniform-disk path (deliberate fail-open).
    }
  }

  const hasPatches = Array.isArray(patches) && patches.length > 0;

  if (allCircles) {
    if (hasPatches) {
      const f = fluxUniformDiskWithPatches({
        rStar,
        rOcculters: circleOcculters,
        brightnessPatches: patches,
        gridRes,
      });
      return clamp01(Number.isFinite(f) ? f : 1.0);
    }

    const f = fluxUniformDisk({ rStar, rOcculters: circleOcculters, gridRes });
    return clamp01(Number.isFinite(f) ? f : 1.0);
  }

  // Mixed-shape occulters: fall back to generic numerical integrators.
  if (ldModel) {
    try {
      const ldLaw = resolveLimbDarkeningForBand(ldModel, ldModel.bandpass);

      if (ldLaw) {
        const f = fluxLimbDarkenedDiskShapes({
          rStar,
          occulters,
          limbDarkeningLaw: ldLaw,
          constraints: ldModel.constraints,
          brightnessPatches: patches,
          gridRes,
        });
        return clamp01(Number.isFinite(f) ? f : 1.0);
      }
    } catch {
      // LD module error; fall through to uniform-disk path for mixed shapes (deliberate fail-open).
    }
  }

  if (hasPatches) {
    const f = fluxUniformDiskWithPatchesShapes({
      rStar,
      occulters,
      brightnessPatches: patches,
      gridRes,
    });
    return clamp01(Number.isFinite(f) ? f : 1.0);
  }

  const f = fluxUniformDiskShapes({ rStar, occulters, gridRes });
  return clamp01(Number.isFinite(f) ? f : 1.0);
}
