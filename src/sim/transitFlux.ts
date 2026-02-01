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

import type { BrightnessPatch, LimbDarkeningLaw, SystemParams } from "../core/types";
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
} from "../experimental/photometry/transitTransmission";
import type { BodyKinematics } from "./kinematics";
import { getLdIntegrators } from "./optionalLimbDarkening";

function resolveLimbDarkeningLaw(
  phot: SystemParams["star"]["photometry"] | undefined,
  bandpass?: unknown,
): LimbDarkeningLaw | undefined {
  const ldModel = phot?.limbDarkeningModel;
  if (!ldModel) return undefined;

  const ld = getLdIntegrators();
  const law = ld
    ? (ld.resolveLimbDarkeningForBand(ldModel, bandpass) as LimbDarkeningLaw | undefined)
    : resolveLimbDarkeningForBand(ldModel, bandpass as any);

  return law && typeof (law as any).kind === "string" ? law : undefined;
}

function buildTransmissionOcculters(
  params: SystemParams,
  kin: BodyKinematics,
  tauScale = 1,
): TransmissionOcculter[] {
  const phot = params.star.photometry;
  const atm = phot?.atmosphereTransmission;
  if (!atm?.enabled) return [];

  const target = atm.target ?? "planet";
  const kind = atm.kind ?? "hard";
  const r0Override = isFinitePositive(atm.r0) ? atm.r0 : undefined;
  const H = isFinitePositive(atm.H) ? atm.H : 0;
  const tau0 = isFiniteNonNegative(atm.tau0) ? atm.tau0 : 0;
  const tauScaleSafe = isFiniteNonNegative(tauScale) ? tauScale : 1;
  const tau0Scaled = tau0 * tauScaleSafe;

  const buildTransmission =
    kind === "exponential-halo" && H > 0 && tau0Scaled > 0
      ? (r0: number) => {
          return (rho: number): number => {
            if (!Number.isFinite(rho) || rho < 0) return 1;
            if (rho <= r0) return 0;
            const tau = tau0Scaled * Math.exp(-(rho - r0) / H);
            return Math.exp(-Math.max(0, tau));
          };
        }
      : undefined;

  const occulters: TransmissionOcculter[] = [];

  const addBody = (
    body: { r: number },
    sky: { x: number; y: number; z: number } | undefined,
    isTarget: boolean,
  ): void => {
    if (!sky) return;
    if (!(sky.z > 0)) return;
    if (!isFinitePositive(body.r)) return;

    const r0 = isTarget && r0Override ? r0Override : body.r;
    const transmission = isTarget && buildTransmission ? buildTransmission(r0) : undefined;

    occulters.push({ dx: sky.x, dy: sky.y, r0, transmission });
  };

  addBody(params.planet, kin.planetSky, target === "planet");
  if (params.moon && kin.moonSky) addBody(params.moon, kin.moonSky, target === "moon");

  return occulters;
}

function normalizeSpectralGrid(atm: { lambdaNm?: number[]; tauScale?: number[] } | undefined): {
  lambdaNm: number[];
  tauScale: number[];
} | null {
  const lambdaRaw = Array.isArray(atm?.lambdaNm) ? atm!.lambdaNm : [];
  const lambdaNm = lambdaRaw.filter((x) => isFinitePositive(x));
  if (lambdaNm.length === 0) return null;

  const tauRaw = Array.isArray(atm?.tauScale) ? atm!.tauScale : [];
  let tauScale: number[] = [];

  if (tauRaw.length === 1 && Number.isFinite(tauRaw[0])) {
    const v = Math.max(0, tauRaw[0]);
    tauScale = lambdaNm.map(() => v);
  } else if (tauRaw.length === lambdaNm.length) {
    tauScale = tauRaw.map((v) => (Number.isFinite(v) ? Math.max(0, v) : 1));
  } else {
    tauScale = lambdaNm.map(() => 1);
  }

  return { lambdaNm, tauScale };
}

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
  if (phot?.atmosphereTransmission?.enabled && allCircles) {
    const spectral = normalizeSpectralGrid(phot.atmosphereTransmission);

    if (spectral) {
      let sum = 0;
      let n = 0;

      for (let i = 0; i < spectral.lambdaNm.length; i++) {
        const occTrans = buildTransmissionOcculters(params, kin, spectral.tauScale[i]);
        if (occTrans.length === 0) return 1.0;

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
          sum += f;
          n += 1;
        }
      }

      return n > 0 ? clamp01(sum / n) : 1.0;
    }

    const occTrans = buildTransmissionOcculters(params, kin);
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
      const bandpass = (ldModel as any)?.bandpass;
      const constraints = (ldModel as any)?.constraints;
      const ldLaw = ld.resolveLimbDarkeningForBand(ldModel, bandpass);

      if (ldLaw) {
        const f = ld.fluxLimbDarkenedDisk({
          rStar,
          rOcculters: circleOcculters,
          limbDarkeningLaw: ldLaw,
          constraints,
          brightnessPatches: patches,
          gridRes,
        });
        return clamp01(Number.isFinite(f) ? f : 1.0);
      }
      // If law resolution fails, fall through to non-LD paths.
    } catch {
      // Optional LD is explicitly "best effort": any runtime issue falls back to uniform-disk paths.
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
      const bandpass = (ldModel as any)?.bandpass;
      const constraints = (ldModel as any)?.constraints;
      const ldLaw = resolveLimbDarkeningForBand(ldModel, bandpass);

      if (ldLaw) {
        const f = fluxLimbDarkenedDiskShapes({
          rStar,
          occulters,
          limbDarkeningLaw: ldLaw,
          constraints,
          brightnessPatches: patches,
          gridRes,
        });
        return clamp01(Number.isFinite(f) ? f : 1.0);
      }
    } catch {
      // Fall through to uniform disk paths for mixed shapes.
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
