// src/sim/transitFlux.ts
//
// Compute multiplicative stellar transit attenuation factor F_transit in [0,1].
//
// Policy:
// - If atmosphereTransmission is enabled, use the transmissive integrator (square grid).
//   * Limb darkening is used only when the resolved law is quadratic; otherwise it falls back to uniform.
// - Else if limbDarkeningModel is configured AND optional LD integrators are available, use LD integrator.
// - Otherwise use uniform-disk integrator.
// - If brightness patches are configured, prefer the patched uniform-disk integrator.
// - Always clamp output into [0,1] and fail-open to 1.0 on non-finite results.

import type { LimbDarkeningLawQuadratic, SystemParams } from "../core/types";
import { clamp01, isFiniteNonNegative, isFinitePositive } from "../core/units";
import type { CircleOcculter } from "../photometry/occulterCircle";
import { fluxUniformDisk } from "../photometry/transitUniform";
import { fluxUniformDiskWithPatches } from "../photometry/transitUniformSpots";
import { resolveLimbDarkeningForBand } from "../photometry/limbDarkening";
import {
  fluxStarWithTransmissiveOcculters,
  type TransmissionOcculter,
} from "../experimental/photometry/transitTransmission";
import type { BodyKinematics } from "./kinematics";
import { getLdIntegrators } from "./optionalLimbDarkening";

function resolveQuadraticLD(
  model: SystemParams["star"]["photometry"] | undefined
): LimbDarkeningLawQuadratic | undefined {
  const ldModel = model?.limbDarkeningModel;
  if (!ldModel) return undefined;

  const bandpass = (ldModel as any)?.bandpass;
  const ld = getLdIntegrators();
  const law = ld
    ? ld.resolveLimbDarkeningForBand(ldModel, bandpass)
    : resolveLimbDarkeningForBand(ldModel, bandpass);

  if (law && (law as any).kind === "quadratic") {
    const u1 = (law as any).u1;
    const u2 = (law as any).u2;
    if (Number.isFinite(u1) && Number.isFinite(u2)) {
      return { kind: "quadratic", u1, u2 };
    }
  }

  return undefined;
}

function buildTransmissionOcculters(params: SystemParams, kin: BodyKinematics): TransmissionOcculter[] {
  const phot = params.star.photometry;
  const atm = phot?.atmosphereTransmission;
  if (!atm?.enabled) return [];

  const target = atm.target ?? "planet";
  const kind = atm.kind ?? "hard";
  const r0Override = isFinitePositive(atm.r0) ? atm.r0 : undefined;
  const H = isFinitePositive(atm.H) ? atm.H : 0;
  const tau0 = isFiniteNonNegative(atm.tau0) ? atm.tau0 : 0;

  const buildTransmission =
    kind === "exponential-halo" && H > 0 && tau0 > 0
      ? (r0: number) => {
          return (rho: number): number => {
            if (!Number.isFinite(rho) || rho < 0) return 1;
            if (rho <= r0) return 0;
            const tau = tau0 * Math.exp(-(rho - r0) / H);
            return Math.exp(-Math.max(0, tau));
          };
        }
      : undefined;

  const occulters: TransmissionOcculter[] = [];

  const addBody = (
    body: { r: number },
    sky: { x: number; y: number; z: number } | undefined,
    isTarget: boolean
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

export function computeTransitFlux(
  params: SystemParams,
  occulters: CircleOcculter[],
  kin: BodyKinematics
): number {
  const rStar = params.star?.r;
  if (!isFinitePositive(rStar)) {
    throw new Error("computeTransitFlux: params.star.r must be a positive finite number.");
  }

  const phot = params.star.photometry;
  const patches = phot?.brightnessPatches;
  const gridRes = phot?.gridRes;

  // Atmosphere transmission: use transmissive integrator when enabled.
  if (phot?.atmosphereTransmission?.enabled) {
    const occTrans = buildTransmissionOcculters(params, kin);
    if (occTrans.length === 0) return 1.0;

    const ldQuad = resolveQuadraticLD(phot);

    const f = fluxStarWithTransmissiveOcculters({
      rStar,
      occulters: occTrans,
      limbDarkening: ldQuad,
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

  if (ldModel && ld) {
    try {
      // Keep this permissive: limb-darkening model schema is intentionally flexible.
      const bandpass = (ldModel as any)?.bandpass;
      const constraints = (ldModel as any)?.constraints;
      const ldLaw = ld.resolveLimbDarkeningForBand(ldModel, bandpass);

      if (ldLaw) {
        const f = ld.fluxLimbDarkenedDisk({
          rStar,
          rOcculters: occulters,
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
  if (hasPatches) {
    const f = fluxUniformDiskWithPatches({
      rStar,
      rOcculters: occulters,
      brightnessPatches: patches,
      gridRes,
    });
    return clamp01(Number.isFinite(f) ? f : 1.0);
  }

  const f = fluxUniformDisk({ rStar, rOcculters: occulters, gridRes });
  return clamp01(Number.isFinite(f) ? f : 1.0);
}
