import type { SystemParams } from "../../core/types";
import { G_SI, isFinitePositive } from "../../core/units";
import { assertOrbit } from "./assertions";

export function assertDynamicsInputs(params: SystemParams): void {
  const nbody = params.dynamics?.nbodyPlanetMoon;
  if (nbody?.enabled) {
    if (!params.moon) throw new Error("nbody enabled requires a moon configuration.");
    if (typeof params.planet.orbit === "function") {
      throw new Error("nbody requires a static planet.orbit (initial conditions, not a function provider).");
    }
    if (typeof params.moon.orbitAroundPlanet === "function") {
      throw new Error(
        "nbody requires a static moon.orbitAroundPlanet (initial conditions, not a function provider).",
      );
    }
    const muStar = isFinitePositive(nbody.muStar)
      ? nbody.muStar
      : isFinitePositive(nbody.mStar ?? params.star?.m)
        ? G_SI * (nbody.mStar ?? (params.star?.m as number))
        : undefined;
    const muPlanet = isFinitePositive(nbody.muPlanet)
      ? nbody.muPlanet
      : isFinitePositive(nbody.mPlanet ?? params.planet?.m)
        ? G_SI * (nbody.mPlanet ?? (params.planet?.m as number))
        : undefined;
    const muMoon = isFinitePositive(nbody.muMoon)
      ? nbody.muMoon
      : isFinitePositive(nbody.mMoon ?? params.moon?.m)
        ? G_SI * (nbody.mMoon ?? (params.moon?.m as number))
        : undefined;

    if (!isFinitePositive(muStar)) throw new Error("nbody.muStar or mStar must be > 0 when enabled.");
    if (!isFinitePositive(muPlanet)) throw new Error("nbody.muPlanet or mPlanet must be > 0 when enabled.");
    if (!isFinitePositive(muMoon)) throw new Error("nbody.muMoon or mMoon must be > 0 when enabled.");
    if (!isFinitePositive(nbody.dtMax)) throw new Error("nbody.dtMax must be > 0 when enabled.");
    if (nbody.softening !== undefined && (!Number.isFinite(nbody.softening) || nbody.softening < 0)) {
      throw new Error("nbody.softening must be finite and >= 0 if provided.");
    }

    const pert = Array.isArray(nbody.perturbers) ? nbody.perturbers : [];
    for (let i = 0; i < pert.length; i++) {
      const p = pert[i];
      if (!p || p.enabled === false) continue;
      const mu = isFinitePositive(p.mu) ? p.mu : isFinitePositive(p.m) ? G_SI * p.m : undefined;
      if (!isFinitePositive(mu)) {
        throw new Error(`nbody.perturbers[${i}].mu or m must be > 0 when enabled.`);
      }
      if (!p.orbit) {
        throw new Error(`nbody.perturbers[${i}].orbit must be provided when enabled.`);
      }
      if (typeof p.orbit === "function") {
        throw new Error("nbody perturbers require static orbit elements (initial conditions).");
      }
      assertOrbit(p.orbit, `nbody.perturbers[${i}].orbit`);
    }
  }

  const dyn = params.dynamics;
  const intg = dyn?.integrator;
  const nbodyIntg = nbody?.integrator;
  const allIntg = [intg, nbodyIntg];
  for (const cfg of allIntg) {
    if (!cfg) continue;
    if (cfg.mode !== undefined && cfg.mode !== "fixed-verlet" && cfg.mode !== "adaptive-verlet") {
      throw new Error("dynamics.integrator.mode must be 'fixed-verlet' or 'adaptive-verlet' if provided.");
    }
    if (cfg.errorTolAbs !== undefined && (!Number.isFinite(cfg.errorTolAbs) || cfg.errorTolAbs <= 0)) {
      throw new Error("dynamics.integrator.errorTolAbs must be finite and > 0 if provided.");
    }
    if (cfg.dtMin !== undefined && (!Number.isFinite(cfg.dtMin) || cfg.dtMin <= 0)) {
      throw new Error("dynamics.integrator.dtMin must be finite and > 0 if provided.");
    }
    if (cfg.maxSubsteps !== undefined && (!Number.isFinite(cfg.maxSubsteps) || cfg.maxSubsteps < 1)) {
      throw new Error("dynamics.integrator.maxSubsteps must be finite and >= 1 if provided.");
    }
  }

  const fid = dyn?.fidelityProfile;
  if (fid !== undefined && fid !== "interactive" && fid !== "accurate" && fid !== "reference") {
    throw new Error("dynamics.fidelityProfile must be interactive|accurate|reference if provided.");
  }

  const relLevel = dyn?.relativityLevel;
  if (relLevel !== undefined && relLevel !== "toy" && relLevel !== "enhanced") {
    throw new Error("dynamics.relativityLevel must be toy|enhanced if provided.");
  }

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

  const rel = params.dynamics?.relativity;
  if (rel?.enabled) {
    const useLTTE = rel.ltte !== false;
    if (useLTTE) {
      if (!isFinitePositive(rel.c)) {
        throw new Error("relativity.c must be > 0 when LTTE is enabled.");
      }
      if (rel.ltteIters !== undefined && (!Number.isFinite(rel.ltteIters) || rel.ltteIters < 1)) {
        throw new Error("relativity.ltteIters must be >= 1 if provided.");
      }
      if (rel.ltteTolSec !== undefined && (!Number.isFinite(rel.ltteTolSec) || rel.ltteTolSec < 0)) {
        throw new Error("relativity.ltteTolSec must be >= 0 if provided.");
      }
    }

    const useGR = rel.grPrecession !== false;
    if (useGR) {
      if (rel.planetPrecessionPerOrbit !== undefined && !Number.isFinite(rel.planetPrecessionPerOrbit)) {
        throw new Error("relativity.planetPrecessionPerOrbit must be finite if provided.");
      }
      if (rel.moonPrecessionPerOrbit !== undefined && !Number.isFinite(rel.moonPrecessionPerOrbit)) {
        throw new Error("relativity.moonPrecessionPerOrbit must be finite if provided.");
      }
    }

    if (rel.shapiroMinImpact !== undefined) {
      if (!Number.isFinite(rel.shapiroMinImpact) || rel.shapiroMinImpact < 0) {
        throw new Error("relativity.shapiroMinImpact must be finite and >= 0 if provided.");
      }
    }
    if (rel.timingRefSec !== undefined && !Number.isFinite(rel.timingRefSec)) {
      throw new Error("relativity.timingRefSec must be finite if provided.");
    }
  }

  const timekeeping = params.observer?.timekeeping;
  if (timekeeping?.enabled) {
    if (
      timekeeping.barycentricOffsetSec !== undefined &&
      !Number.isFinite(timekeeping.barycentricOffsetSec)
    ) {
      throw new Error("observer.timekeeping.barycentricOffsetSec must be finite if provided.");
    }
    if (timekeeping.periodicErrorAmpSec !== undefined && !Number.isFinite(timekeeping.periodicErrorAmpSec)) {
      throw new Error("observer.timekeeping.periodicErrorAmpSec must be finite if provided.");
    }
    if (
      timekeeping.periodSec !== undefined &&
      (!Number.isFinite(timekeeping.periodSec) || timekeeping.periodSec <= 0)
    ) {
      throw new Error("observer.timekeeping.periodSec must be finite and > 0 if provided.");
    }
    if (timekeeping.phaseSec !== undefined && !Number.isFinite(timekeeping.phaseSec)) {
      throw new Error("observer.timekeeping.phaseSec must be finite if provided.");
    }
  }
}
