/** Builds normalized context and shared phase-channel policies for additive flux. */
import type { PhaseCurveParams, SystemParams, ThermalModelAdvancedParams } from "../core/types";
import type { Vec3 } from "../physics/vec3";
import { isPhysicsFeatureEnabled } from "./fidelity";
import type { BodyKinematics } from "./kinematics";
import { resolveOrbitElements } from "./orbits";
import type { AdditiveFluxContext, BandWeight } from "./additiveFluxTypes";

const isPositiveFinite = (value: number | undefined): value is number =>
  Number.isFinite(value) && (value as number) > 0;

function normalizedBandWeights(phot: SystemParams["star"]["photometry"]): BandWeight[] {
  const bp = phot?.spectralBandpass;
  if (!bp?.enabled || !Array.isArray(bp.lambdaNm) || bp.lambdaNm.length === 0) {
    return [{ lambdaNm: 550, w: 1 }];
  }
  const keepIdx: number[] = [];
  const lambda: number[] = [];
  for (let index = 0; index < bp.lambdaNm.length; index++) {
    const value = bp.lambdaNm[index];
    if (!isPositiveFinite(value)) continue;
    keepIdx.push(index);
    lambda.push(value);
  }
  if (lambda.length === 0) return [{ lambdaNm: 550, w: 1 }];
  const rawWeights = Array.isArray(bp.weights) ? bp.weights : [];
  const raw =
    rawWeights.length === bp.lambdaNm.length
      ? keepIdx.map((index) => rawWeights[index])
      : rawWeights.length === lambda.length
        ? rawWeights
        : lambda.map(() => 1);
  const clipped = raw.map((value) => (isPositiveFinite(value) ? value : 0));
  const sum = clipped.reduce((total, value) => total + value, 0);
  const weights = sum > 0 ? clipped.map((value) => value / sum) : lambda.map(() => 1 / lambda.length);
  return lambda.map((lambdaNm, index) => ({ lambdaNm, w: weights[index] }));
}

export function createAdditiveFluxContext(
  params: SystemParams,
  t: number,
  observerDir: Vec3,
  kin: BodyKinematics,
): AdditiveFluxContext {
  const phot = params.star.photometry;
  return {
    params,
    t,
    observerDir,
    kin,
    phot,
    starRadius: params.star.r,
    bands: normalizedBandWeights(phot),
    orbit: kin.planetOrbit ?? resolveOrbitElements(params.planet.orbit, t, "planet.orbit"),
    thermalModelAdvanced: isPhysicsFeatureEnabled(params, "thermalEnergyBalance")
      ? phot?.thermalModelAdvanced
      : undefined,
    scientificEnergyComposition:
      params.dynamics?.fidelityProfile === "accurate" || params.dynamics?.fidelityProfile === "reference",
    rt: isPhysicsFeatureEnabled(params, "atmosphereRT") ? phot?.atmosphereRT : undefined,
  };
}

export function bandScatteringBoost(lambdaNm: number, context: AdditiveFluxContext): number {
  const rt = context.rt;
  if (!rt?.enabled || !rt.scattering?.enabled) return 1;
  const gain = Number.isFinite(rt.scattering.gain) ? Math.max(0, rt.scattering.gain as number) : 0;
  const g = Number.isFinite(rt.scattering.g) ? Math.max(-0.95, Math.min(0.95, rt.scattering.g as number)) : 0;
  const lambdaRef = Number.isFinite(rt.lambdaRefNm) ? Math.max(1, rt.lambdaRefNm as number) : 550;
  const wavelength = Number.isFinite(lambdaNm) ? Math.max(1, lambdaNm) : lambdaRef;
  return 1 + gain * Math.pow(wavelength / lambdaRef, -(0.3 + 0.4 * Math.max(0, g)));
}

export function hasActiveThermalPhaseChannel(args: {
  model: PhaseCurveParams | undefined;
  thermalModelAdvanced: ThermalModelAdvancedParams | undefined;
  system: SystemParams;
}): boolean {
  if (!args.model?.enabled) return false;
  if (Number.isFinite(args.model.thermAmp) && (args.model.thermAmp as number) > 0) return true;
  if (Number.isFinite(args.model.constant) && (args.model.constant as number) > 0) return true;
  return Boolean(
    isPhysicsFeatureEnabled(args.system, "thermalEnergyBalance") && args.thermalModelAdvanced?.enabled,
  );
}

export function hasActiveReflectedPhaseChannel(model: PhaseCurveParams | undefined): boolean {
  return Boolean(model?.enabled && Number.isFinite(model.reflAmp) && (model.reflAmp as number) > 0);
}
