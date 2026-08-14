/** Applies shared circle and mixed-shape occultation policy with fail-open fallbacks. */
import type { BrightnessPatch, LimbDarkeningLaw, PassbandId, SystemParams } from "../core/types";
import { clamp01, isFinitePositive } from "../core/units";
import type { CircleOcculter } from "../photometry/occulterCircle";
import { type OcculterShape, isCircleOcculter } from "../photometry/occulterEllipse";
import { resolveLimbDarkeningForBand } from "../photometry/limbDarkening";
import {
  fluxLimbDarkenedDiskShapes,
  fluxUniformDiskShapes,
  fluxUniformDiskWithPatchesShapes,
} from "../photometry/transitShapes";
import { fluxUniformDisk } from "../photometry/transitUniform";
import { fluxUniformDiskWithPatches } from "../photometry/transitUniformSpots";
import type { BodyKinematics } from "./kinematics";
import { getLdIntegrators } from "./optionalLimbDarkening";

export type StarPhotometry = SystemParams["star"]["photometry"];

export type TransitFluxInputs = {
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

export function resolveTransitLimbDarkeningLaw(
  phot: StarPhotometry,
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

function assertStarRadius(params: SystemParams): number {
  const rStar = params.star?.r;
  if (!isFinitePositive(rStar)) {
    throw new Error("computeTransitFlux: params.star.r must be a positive finite number.");
  }
  return rStar;
}

export function createTransitFluxInputs(
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

export function finiteClampedFlux(value: number): number {
  return clamp01(Number.isFinite(value) ? value : 1.0);
}

function hasBrightnessPatches(patches: BrightnessPatch[] | undefined): patches is BrightnessPatch[] {
  return Array.isArray(patches) && patches.length > 0;
}

function computeOptionalCircleLdFlux(inputs: TransitFluxInputs): number | undefined {
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
    return undefined;
  }
}

export function computeCircleFlux(inputs: TransitFluxInputs): number {
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
}

function computeOptionalMixedLdFlux(inputs: TransitFluxInputs): number | undefined {
  const ldModel = inputs.phot?.limbDarkeningModel;
  if (!ldModel) return undefined;

  try {
    const ldLaw = resolveTransitLimbDarkeningLaw(inputs.phot, ldModel.bandpass);
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
    return undefined;
  }
}

export function computeMixedShapeFlux(inputs: TransitFluxInputs): number {
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
}
