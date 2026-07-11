import type {
  IntegratorParams,
  NBodyPerturberParams,
  NBodyPlanetMoonParams,
  RelativityParams,
  SystemDynamicsParams,
  SystemParams,
} from "../../core/types";
import { G_SI, isFinitePositive } from "../../core/units";
import { assertOrbit } from "./assertions";

type TimekeepingParams = NonNullable<SystemParams["observer"]>["timekeeping"];

const resolvedMu = (mu: unknown, mass: unknown): number | undefined => {
  if (isFinitePositive(mu)) return mu;
  return isFinitePositive(mass) ? G_SI * mass : undefined;
};

const assertNBodyMoon = (params: SystemParams): void => {
  if (!params.moon) throw new Error("nbody enabled requires a moon configuration.");
};

const assertNBodyStaticOrbits = (params: SystemParams): void => {
  if (typeof params.planet.orbit === "function") {
    throw new Error("nbody requires a static planet.orbit (initial conditions, not a function provider).");
  }
  if (typeof params.moon?.orbitAroundPlanet === "function") {
    throw new Error(
      "nbody requires a static moon.orbitAroundPlanet (initial conditions, not a function provider).",
    );
  }
};

const assertNBodyMu = (label: string, mu: number | undefined): void => {
  if (!isFinitePositive(mu))
    throw new Error(`nbody.${label} or m${label.slice(2)} must be > 0 when enabled.`);
};

const assertNBodyGravity = (params: SystemParams, nbody: NBodyPlanetMoonParams): void => {
  assertNBodyMu("muStar", resolvedMu(nbody.muStar, nbody.mStar ?? params.star?.m));
  assertNBodyMu("muPlanet", resolvedMu(nbody.muPlanet, nbody.mPlanet ?? params.planet?.m));
  assertNBodyMu("muMoon", resolvedMu(nbody.muMoon, nbody.mMoon ?? params.moon?.m));
};

const assertNBodyStepConfig = (nbody: NBodyPlanetMoonParams): void => {
  if (!isFinitePositive(nbody.dtMax)) throw new Error("nbody.dtMax must be > 0 when enabled.");
  if (nbody.softening !== undefined && (!Number.isFinite(nbody.softening) || nbody.softening < 0)) {
    throw new Error("nbody.softening must be finite and >= 0 if provided.");
  }
};

const perturberMu = (perturber: NBodyPerturberParams): number | undefined => {
  return isFinitePositive(perturber.mu)
    ? perturber.mu
    : isFinitePositive(perturber.m)
      ? G_SI * perturber.m
      : undefined;
};

const assertPerturberMu = (perturber: NBodyPerturberParams, index: number): void => {
  if (!isFinitePositive(perturberMu(perturber))) {
    throw new Error(`nbody.perturbers[${index}].mu or m must be > 0 when enabled.`);
  }
};

const assertPerturberOrbit = (perturber: NBodyPerturberParams, index: number): void => {
  if (!perturber.orbit) {
    throw new Error(`nbody.perturbers[${index}].orbit must be provided when enabled.`);
  }
  if (typeof perturber.orbit === "function") {
    throw new Error("nbody perturbers require static orbit elements (initial conditions).");
  }
  assertOrbit(perturber.orbit, `nbody.perturbers[${index}].orbit`);
};

const assertEnabledPerturber = (perturber: NBodyPerturberParams, index: number): void => {
  assertPerturberMu(perturber, index);
  assertPerturberOrbit(perturber, index);
};

const assertNBodyPerturbers = (nbody: NBodyPlanetMoonParams): void => {
  const perturbers = Array.isArray(nbody.perturbers) ? nbody.perturbers : [];
  for (let index = 0; index < perturbers.length; index++) {
    const perturber = perturbers[index];
    if (!perturber || perturber.enabled === false) continue;
    assertEnabledPerturber(perturber, index);
  }
};

const assertNBodyInputs = (params: SystemParams, nbody: NBodyPlanetMoonParams | undefined): void => {
  if (!nbody?.enabled) return;
  assertNBodyMoon(params);
  assertNBodyStaticOrbits(params);
  assertNBodyGravity(params, nbody);
  assertNBodyStepConfig(nbody);
  assertNBodyPerturbers(nbody);
};

const assertIntegratorMode = (cfg: IntegratorParams): void => {
  if (cfg.mode !== undefined && cfg.mode !== "fixed-verlet" && cfg.mode !== "adaptive-verlet") {
    throw new Error("dynamics.integrator.mode must be 'fixed-verlet' or 'adaptive-verlet' if provided.");
  }
};

const assertIntegratorPositiveField = (cfg: IntegratorParams, field: "errorTolAbs" | "dtMin"): void => {
  if (cfg[field] !== undefined && (!Number.isFinite(cfg[field]) || cfg[field] <= 0)) {
    throw new Error(`dynamics.integrator.${field} must be finite and > 0 if provided.`);
  }
};

const assertIntegratorMaxSubsteps = (cfg: IntegratorParams): void => {
  if (cfg.maxSubsteps !== undefined && (!Number.isFinite(cfg.maxSubsteps) || cfg.maxSubsteps < 1)) {
    throw new Error("dynamics.integrator.maxSubsteps must be finite and >= 1 if provided.");
  }
};

const assertIntegratorConfig = (cfg: IntegratorParams | undefined): void => {
  if (!cfg) return;
  assertIntegratorMode(cfg);
  assertIntegratorPositiveField(cfg, "errorTolAbs");
  assertIntegratorPositiveField(cfg, "dtMin");
  assertIntegratorMaxSubsteps(cfg);
};

const assertIntegratorInputs = (
  dyn: SystemDynamicsParams | undefined,
  nbody: NBodyPlanetMoonParams | undefined,
): void => {
  assertIntegratorConfig(dyn?.integrator);
  assertIntegratorConfig(nbody?.integrator);
};

const assertFidelityProfile = (dyn: SystemDynamicsParams | undefined): void => {
  const fid = dyn?.fidelityProfile;
  if (fid !== undefined && fid !== "interactive" && fid !== "accurate" && fid !== "reference") {
    throw new Error("dynamics.fidelityProfile must be interactive|accurate|reference if provided.");
  }
};

const assertRelativityLevel = (dyn: SystemDynamicsParams | undefined): void => {
  const relLevel = dyn?.relativityLevel;
  if (relLevel !== undefined && relLevel !== "toy" && relLevel !== "enhanced") {
    throw new Error("dynamics.relativityLevel must be toy|enhanced if provided.");
  }
};

const assertCollisionPolicy = (dyn: SystemDynamicsParams | undefined): void => {
  const col = dyn?.collisionPolicy;
  if (col?.minSeparation !== undefined && (!Number.isFinite(col.minSeparation) || col.minSeparation < 0)) {
    throw new Error("dynamics.collisionPolicy.minSeparation must be finite and >= 0 if provided.");
  }
  if (
    col?.onCloseEncounter !== undefined &&
    col.onCloseEncounter !== "warn" &&
    col.onCloseEncounter !== "abort"
  ) {
    throw new Error("dynamics.collisionPolicy.onCloseEncounter must be warn|abort if provided.");
  }
};

const assertLtteInputs = (rel: RelativityParams): void => {
  if (rel.ltte === false) return;
  assertLtteLightSpeed(rel);
  assertLtteIterations(rel);
  assertLtteTolerance(rel);
};

const assertLtteLightSpeed = (rel: RelativityParams): void => {
  if (!isFinitePositive(rel.c)) {
    throw new Error("relativity.c must be > 0 when LTTE is enabled.");
  }
};

const assertLtteIterations = (rel: RelativityParams): void => {
  if (rel.ltteIters !== undefined && (!Number.isFinite(rel.ltteIters) || rel.ltteIters < 1)) {
    throw new Error("relativity.ltteIters must be >= 1 if provided.");
  }
};

const assertLtteTolerance = (rel: RelativityParams): void => {
  if (rel.ltteTolSec !== undefined && (!Number.isFinite(rel.ltteTolSec) || rel.ltteTolSec < 0)) {
    throw new Error("relativity.ltteTolSec must be >= 0 if provided.");
  }
};

const assertGrPrecessionInputs = (rel: RelativityParams): void => {
  if (rel.grPrecession === false) return;
  if (rel.planetPrecessionPerOrbit !== undefined && !Number.isFinite(rel.planetPrecessionPerOrbit)) {
    throw new Error("relativity.planetPrecessionPerOrbit must be finite if provided.");
  }
  if (rel.moonPrecessionPerOrbit !== undefined && !Number.isFinite(rel.moonPrecessionPerOrbit)) {
    throw new Error("relativity.moonPrecessionPerOrbit must be finite if provided.");
  }
};

const assertRelativityOptionalInputs = (rel: RelativityParams): void => {
  if (rel.shapiroMinImpact !== undefined) {
    if (!Number.isFinite(rel.shapiroMinImpact) || rel.shapiroMinImpact < 0) {
      throw new Error("relativity.shapiroMinImpact must be finite and >= 0 if provided.");
    }
  }
  if (rel.timingRefSec !== undefined && !Number.isFinite(rel.timingRefSec)) {
    throw new Error("relativity.timingRefSec must be finite if provided.");
  }
};

const assertRelativityInputs = (rel: RelativityParams | undefined): void => {
  if (!rel?.enabled) return;
  assertLtteInputs(rel);
  assertGrPrecessionInputs(rel);
  assertRelativityOptionalInputs(rel);
};

const assertFiniteTimekeepingField = (
  timekeeping: TimekeepingParams,
  field: "barycentricOffsetSec" | "periodicErrorAmpSec" | "phaseSec",
): void => {
  if (timekeeping?.[field] !== undefined && !Number.isFinite(timekeeping[field])) {
    throw new Error(`observer.timekeeping.${field} must be finite if provided.`);
  }
};

const assertTimekeepingPeriod = (timekeeping: TimekeepingParams): void => {
  if (
    timekeeping?.periodSec !== undefined &&
    (!Number.isFinite(timekeeping.periodSec) || timekeeping.periodSec <= 0)
  ) {
    throw new Error("observer.timekeeping.periodSec must be finite and > 0 if provided.");
  }
};

const assertTimekeepingInputs = (timekeeping: TimekeepingParams): void => {
  if (!timekeeping?.enabled) return;
  assertFiniteTimekeepingField(timekeeping, "barycentricOffsetSec");
  assertFiniteTimekeepingField(timekeeping, "periodicErrorAmpSec");
  assertTimekeepingPeriod(timekeeping);
  assertFiniteTimekeepingField(timekeeping, "phaseSec");
};

export function assertDynamicsInputs(params: SystemParams): void {
  const dyn = params.dynamics;
  const nbody = dyn?.nbodyPlanetMoon;

  assertNBodyInputs(params, nbody);
  assertIntegratorInputs(dyn, nbody);
  assertFidelityProfile(dyn);
  assertRelativityLevel(dyn);
  assertCollisionPolicy(dyn);
  assertRelativityInputs(dyn?.relativity);
  assertTimekeepingInputs(params.observer?.timekeeping);
}
