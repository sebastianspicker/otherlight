// src/sim/validation/assertions.ts
//
// Centralized validation helpers (ported from the original monolithic sim.ts).
// Keep these checks strict and early to preserve “fail fast” behavior.

import type { OrbitElements, OrbitElementsProvider, PhaseCurveParams, SystemParams } from "../../core/types";
import { G_SI, isFiniteNonNegative, isFinitePositive } from "../../core/units";

function usesHigherFidelityAdditiveComposition(params: SystemParams): boolean {
  const fid = params.dynamics?.fidelityProfile;
  return fid === "accurate" || fid === "reference";
}

function hasActiveThermalPhaseChannel(model: PhaseCurveParams | undefined, params: SystemParams): boolean {
  if (!model?.enabled) return false;
  if (Number.isFinite(model.thermAmp) && (model.thermAmp as number) > 0) return true;
  if (Number.isFinite(model.constant) && (model.constant as number) > 0) return true;
  return Boolean(params.star.photometry?.thermalModelAdvanced?.enabled);
}

function hasActiveReflectedPhaseChannel(model: PhaseCurveParams | undefined): boolean {
  return Boolean(model?.enabled && Number.isFinite(model.reflAmp) && (model.reflAmp as number) > 0);
}

function hasActiveHigherFidelityAdditiveChannels(params: SystemParams): boolean {
  const phot = params.star.photometry;
  const rtEmission = phot?.atmosphereRT?.emission;
  return Boolean(
    phot?.phaseCurve?.enabled ||
    phot?.moonPhaseCurve?.enabled ||
    (phot?.forwardScattering?.enabled &&
      Number.isFinite(phot.forwardScattering.amp) &&
      (phot.forwardScattering.amp as number) > 0) ||
    (phot?.ringScattering?.enabled &&
      Number.isFinite(phot.ringScattering.amp) &&
      (phot.ringScattering.amp as number) > 0) ||
    (phot?.atmosphereRT?.enabled &&
      rtEmission?.enabled &&
      Number.isFinite(rtEmission.amp) &&
      (rtEmission.amp as number) > 0),
  );
}

function assertBodyRadius(r: unknown, name: string): void {
  if (!isFinitePositive(r)) throw new Error(`${name}.r must be > 0 and finite`);
}

function assertOptionalMass(m: unknown, name: string): void {
  // Mass is optional; if present it must be finite and >= 0 (0 disables barycentric effects cleanly).
  if (m === undefined) return;
  if (!isFiniteNonNegative(m)) throw new Error(`${name}.m must be finite and >= 0 if provided`);
}

function assertOblateness(shape: { oblateness?: number } | undefined, name: string): void {
  if (!shape) return;
  const f = shape.oblateness;
  if (f === undefined) return;
  if (!Number.isFinite(f) || f < 0 || f >= 1) {
    throw new Error(`${name}.shape.oblateness must be in [0,1).`);
  }
}

function assertRings(
  rings:
    | { innerRadius: number; outerRadius: number; inclination?: number; positionAngle?: number }
    | undefined,
  name: string,
): void {
  if (!rings) return;
  const inner = rings.innerRadius;
  const outer = rings.outerRadius;
  if (!Number.isFinite(inner) || inner < 0) {
    throw new Error(`${name}.rings.innerRadius must be finite and >= 0.`);
  }
  if (!Number.isFinite(outer) || outer <= inner) {
    throw new Error(`${name}.rings.outerRadius must be finite and > innerRadius.`);
  }
  if (rings.inclination !== undefined && !Number.isFinite(rings.inclination)) {
    throw new Error(`${name}.rings.inclination must be finite if provided.`);
  }
  if (rings.positionAngle !== undefined && !Number.isFinite(rings.positionAngle)) {
    throw new Error(`${name}.rings.positionAngle must be finite if provided.`);
  }
}

function assertBodyAdvanced(
  body:
    | {
        spin?: { rotationPeriodSec?: number; obliquity?: number; axisPositionAngle?: number };
        gravityHarmonics?: { J2?: number };
        tides?: { enabled?: boolean; k2?: number; Q?: number; daDt?: number; deDt?: number };
      }
    | undefined,
  name: string,
): void {
  if (!body) return;
  const spin = body.spin;
  if (spin) {
    if (
      spin.rotationPeriodSec !== undefined &&
      (!Number.isFinite(spin.rotationPeriodSec) || spin.rotationPeriodSec <= 0)
    ) {
      throw new Error(`${name}.spin.rotationPeriodSec must be finite and > 0 if provided.`);
    }
    if (
      spin.obliquity !== undefined &&
      (!Number.isFinite(spin.obliquity) || spin.obliquity < 0 || spin.obliquity > Math.PI)
    ) {
      throw new Error(`${name}.spin.obliquity must be in [0,pi] if provided.`);
    }
    if (spin.axisPositionAngle !== undefined && !Number.isFinite(spin.axisPositionAngle)) {
      throw new Error(`${name}.spin.axisPositionAngle must be finite if provided.`);
    }
  }

  const gh = body.gravityHarmonics;
  if (gh?.J2 !== undefined && (!Number.isFinite(gh.J2) || gh.J2 < 0 || gh.J2 > 1)) {
    throw new Error(`${name}.gravityHarmonics.J2 must be finite and in [0,1] if provided.`);
  }

  const tides = body.tides;
  if (tides?.enabled) {
    if (tides.k2 !== undefined && (!Number.isFinite(tides.k2) || tides.k2 < 0)) {
      throw new Error(`${name}.tides.k2 must be finite and >= 0 if provided.`);
    }
    if (tides.Q !== undefined && (!Number.isFinite(tides.Q) || tides.Q <= 0)) {
      throw new Error(`${name}.tides.Q must be finite and > 0 if provided.`);
    }
    if (tides.daDt !== undefined && !Number.isFinite(tides.daDt)) {
      throw new Error(`${name}.tides.daDt must be finite if provided.`);
    }
    if (tides.deDt !== undefined && !Number.isFinite(tides.deDt)) {
      throw new Error(`${name}.tides.deDt must be finite if provided.`);
    }
  }
}

export function assertOrbit(el: OrbitElements, name: string): void {
  if (!el || typeof el !== "object") throw new Error(`${name} must be an object.`);
  if (!Number.isFinite(el.a) || el.a <= 0) throw new Error(`${name}.a must be > 0`);
  if (!Number.isFinite(el.e) || el.e < 0 || el.e >= 1) throw new Error(`${name}.e must be in [0, 1)`);
  if (!Number.isFinite(el.period) || el.period <= 0) throw new Error(`${name}.period must be > 0`);

  // Angles and epoch must be finite (angles are radians by project convention).
  if (!Number.isFinite(el.inc)) throw new Error(`${name}.inc must be finite`);
  if (el.inc < 0 || el.inc > Math.PI) {
    throw new Error(`${name}.inc must be in [0, pi] radians.`);
  }
  if (!Number.isFinite(el.Omega)) throw new Error(`${name}.Omega must be finite`);
  if (!Number.isFinite(el.omega)) throw new Error(`${name}.omega must be finite`);
  if (!Number.isFinite(el.t0)) throw new Error(`${name}.t0 must be finite`);
}

export function assertOrbitProvider(elOrProvider: OrbitElements | OrbitElementsProvider, name: string): void {
  // Provider itself can’t be fully validated without a time; validate “static” object immediately.
  if (typeof elOrProvider !== "function") assertOrbit(elOrProvider, name);
}

/**
 * Mirrors the top-of-step validation from the original sim.ts stepSystem().
 * Additionally validates key orbital inputs so downstream physics never sees invalid elements.
 */
export function assertStepInputs(params: SystemParams, t: number): void {
  if (!params.star || !params.planet) throw new Error("stepSystem: missing star/planet params.");
  if (!Number.isFinite(t)) throw new Error("stepSystem: t must be finite.");

  // Body radii are mandatory for geometry + photometry.
  assertBodyRadius(params.star.r, "star");
  assertBodyRadius(params.planet.r, "planet");
  if (params.moon) assertBodyRadius(params.moon.r, "moon");

  // Masses are optional but must be sane if provided (used for barycenter split / diagnostics).
  assertOptionalMass(params.star.m, "star");
  assertOptionalMass(params.planet.m, "planet");
  if (params.moon) assertOptionalMass(params.moon.m, "moon");

  // Optional shape/ring parameters.
  assertOblateness(params.planet.shape, "planet");
  assertRings(params.planet.rings, "planet");
  assertBodyAdvanced(params.planet, "planet");
  if (params.moon) {
    assertOblateness(params.moon.shape, "moon");
    assertRings(params.moon.rings, "moon");
    assertBodyAdvanced(params.moon, "moon");
  }
  assertBodyAdvanced(params.star, "star");

  // Orbits must be present and valid (static or provider).
  if (!params.planet.orbit) throw new Error("planet.orbit must be provided.");
  assertOrbitProvider(params.planet.orbit, "planet.orbit");

  if (params.moon) {
    if (!params.moon.orbitAroundPlanet)
      throw new Error("moon.orbitAroundPlanet must be provided when moon exists.");
    assertOrbitProvider(params.moon.orbitAroundPlanet, "moon.orbitAroundPlanet");
  }

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
  }

  // Optional photometry numeric knobs: if present, must be finite (downstream clamps as needed).
  const gridRes = params.star.photometry?.gridRes;
  if (gridRes !== undefined) {
    if (!Number.isFinite(gridRes) || gridRes <= 0) {
      throw new Error("star.photometry.gridRes must be > 0 and finite if provided.");
    }
  }

  const baselineFlux = params.star.photometry?.baselineFlux;
  if (baselineFlux !== undefined) {
    if (!isFiniteNonNegative(baselineFlux)) {
      throw new Error("star.photometry.baselineFlux must be finite and >= 0 if provided.");
    }
  }

  const cadenceSec = params.star.photometry?.cadenceSec;
  if (cadenceSec !== undefined) {
    if (!isFiniteNonNegative(cadenceSec)) {
      throw new Error("star.photometry.cadenceSec must be finite and >= 0 if provided.");
    }
  }

  const nSubsamples = params.star.photometry?.nSubsamples;
  if (nSubsamples !== undefined) {
    if (!Number.isFinite(nSubsamples) || nSubsamples < 1) {
      throw new Error("star.photometry.nSubsamples must be finite and >= 1 if provided.");
    }
  }

  const phaseCurve = params.star.photometry?.phaseCurve;
  if (phaseCurve?.thermalInertia?.enabled) {
    const ti = phaseCurve.thermalInertia;
    if (ti.albedo !== undefined && (!Number.isFinite(ti.albedo) || ti.albedo < 0 || ti.albedo > 1)) {
      throw new Error("phaseCurve.thermalInertia.albedo must be in [0,1] if provided.");
    }
    if (
      ti.emissivity !== undefined &&
      (!Number.isFinite(ti.emissivity) || ti.emissivity < 0 || ti.emissivity > 1)
    ) {
      throw new Error("phaseCurve.thermalInertia.emissivity must be in [0,1] if provided.");
    }
    if (
      ti.thermalTimescaleSec !== undefined &&
      (!Number.isFinite(ti.thermalTimescaleSec) || ti.thermalTimescaleSec < 0)
    ) {
      throw new Error("phaseCurve.thermalInertia.thermalTimescaleSec must be >= 0 if provided.");
    }
    if (
      ti.redistribution !== undefined &&
      (!Number.isFinite(ti.redistribution) || ti.redistribution < 0 || ti.redistribution > 1)
    ) {
      throw new Error("phaseCurve.thermalInertia.redistribution must be in [0,1] if provided.");
    }
  }

  const moonPhase = params.star.photometry?.moonPhaseCurve;
  if (moonPhase?.thermalInertia?.enabled) {
    const ti = moonPhase.thermalInertia;
    if (ti.albedo !== undefined && (!Number.isFinite(ti.albedo) || ti.albedo < 0 || ti.albedo > 1)) {
      throw new Error("moonPhaseCurve.thermalInertia.albedo must be in [0,1] if provided.");
    }
    if (
      ti.emissivity !== undefined &&
      (!Number.isFinite(ti.emissivity) || ti.emissivity < 0 || ti.emissivity > 1)
    ) {
      throw new Error("moonPhaseCurve.thermalInertia.emissivity must be in [0,1] if provided.");
    }
    if (
      ti.thermalTimescaleSec !== undefined &&
      (!Number.isFinite(ti.thermalTimescaleSec) || ti.thermalTimescaleSec < 0)
    ) {
      throw new Error("moonPhaseCurve.thermalInertia.thermalTimescaleSec must be >= 0 if provided.");
    }
    if (
      ti.redistribution !== undefined &&
      (!Number.isFinite(ti.redistribution) || ti.redistribution < 0 || ti.redistribution > 1)
    ) {
      throw new Error("moonPhaseCurve.thermalInertia.redistribution must be in [0,1] if provided.");
    }
  }

  const spot = params.star.photometry?.spotEvolution;
  if (spot?.enabled) {
    const period = spot.rotationPeriodSec ?? Number.NaN;
    if (!Number.isFinite(period) || period <= 0) {
      throw new Error("star.photometry.spotEvolution.rotationPeriodSec must be > 0 when enabled.");
    }
    const coverage = spot.coverage;
    if (coverage !== undefined && (!Number.isFinite(coverage) || coverage < 0 || coverage > 1)) {
      throw new Error("star.photometry.spotEvolution.coverage must be in [0,1] if provided.");
    }
    const lifetime = spot.lifetimeSec;
    if (lifetime !== undefined && (!Number.isFinite(lifetime) || lifetime < 0)) {
      throw new Error("star.photometry.spotEvolution.lifetimeSec must be >= 0 if provided.");
    }
    const drift = spot.driftRateRadPerSec;
    if (drift !== undefined && !Number.isFinite(drift)) {
      throw new Error("star.photometry.spotEvolution.driftRateRadPerSec must be finite if provided.");
    }
    const tRef = spot.tRef;
    if (tRef !== undefined && !Number.isFinite(tRef)) {
      throw new Error("star.photometry.spotEvolution.tRef must be finite if provided.");
    }
    const phase0 = spot.rotationPhase0;
    if (phase0 !== undefined && !Number.isFinite(phase0)) {
      throw new Error("star.photometry.spotEvolution.rotationPhase0 must be finite if provided.");
    }
  }

  const surf = params.star.photometry?.stellarSurface;
  if (surf?.enabled) {
    if (
      surf.differentialRotationK !== undefined &&
      (!Number.isFinite(surf.differentialRotationK) ||
        surf.differentialRotationK < 0 ||
        surf.differentialRotationK > 1)
    ) {
      throw new Error("star.photometry.stellarSurface.differentialRotationK must be in [0,1] if provided.");
    }
    if (
      surf.rotationPeriodSec !== undefined &&
      (!Number.isFinite(surf.rotationPeriodSec) || surf.rotationPeriodSec <= 0)
    ) {
      throw new Error("star.photometry.stellarSurface.rotationPeriodSec must be finite and > 0 if provided.");
    }
  }

  const bp = params.star.photometry?.spectralBandpass;
  if (bp?.enabled) {
    const lambda = Array.isArray(bp.lambdaNm) ? bp.lambdaNm : [];
    if (lambda.length > 0 && lambda.some((x) => !Number.isFinite(x) || x <= 0)) {
      throw new Error("star.photometry.spectralBandpass.lambdaNm entries must be finite and > 0.");
    }
    const weights = Array.isArray(bp.weights) ? bp.weights : [];
    if (weights.length > 0 && weights.some((x) => !Number.isFinite(x) || x < 0)) {
      throw new Error("star.photometry.spectralBandpass.weights entries must be finite and >= 0.");
    }
  }

  const rt = params.star.photometry?.atmosphereRT;
  if (rt?.enabled) {
    if (rt.lambdaRefNm !== undefined && (!Number.isFinite(rt.lambdaRefNm) || rt.lambdaRefNm <= 0)) {
      throw new Error("star.photometry.atmosphereRT.lambdaRefNm must be finite and > 0 if provided.");
    }
    const layers = Array.isArray(rt.layers) ? rt.layers : [];
    for (let i = 0; i < layers.length; i++) {
      const ly = layers[i];
      if (!Number.isFinite(ly.r0) || ly.r0 <= 0) {
        throw new Error(`star.photometry.atmosphereRT.layers[${i}].r0 must be finite and > 0.`);
      }
      if (!Number.isFinite(ly.H) || ly.H <= 0) {
        throw new Error(`star.photometry.atmosphereRT.layers[${i}].H must be finite and > 0.`);
      }
      if (!Number.isFinite(ly.tau0) || ly.tau0 < 0) {
        throw new Error(`star.photometry.atmosphereRT.layers[${i}].tau0 must be finite and >= 0.`);
      }
      if (ly.alpha !== undefined && !Number.isFinite(ly.alpha)) {
        throw new Error(`star.photometry.atmosphereRT.layers[${i}].alpha must be finite if provided.`);
      }
    }
  }

  const thAdv = params.star.photometry?.thermalModelAdvanced;
  if (thAdv?.enabled) {
    if (
      thAdv.equilibriumScale !== undefined &&
      (!Number.isFinite(thAdv.equilibriumScale) || thAdv.equilibriumScale < 0)
    ) {
      throw new Error(
        "star.photometry.thermalModelAdvanced.equilibriumScale must be finite and >= 0 if provided.",
      );
    }
    if (
      thAdv.redistribution !== undefined &&
      (!Number.isFinite(thAdv.redistribution) || thAdv.redistribution < 0 || thAdv.redistribution > 1)
    ) {
      throw new Error("star.photometry.thermalModelAdvanced.redistribution must be in [0,1] if provided.");
    }
    if (thAdv.tauSec !== undefined && (!Number.isFinite(thAdv.tauSec) || thAdv.tauSec < 0)) {
      throw new Error("star.photometry.thermalModelAdvanced.tauSec must be finite and >= 0 if provided.");
    }
  }

  const ringSc = params.star.photometry?.ringScattering;
  if (ringSc?.enabled) {
    if (ringSc.amp !== undefined && (!Number.isFinite(ringSc.amp) || ringSc.amp < 0)) {
      throw new Error("star.photometry.ringScattering.amp must be finite and >= 0 if provided.");
    }
    if (ringSc.sigmaPhase !== undefined && (!Number.isFinite(ringSc.sigmaPhase) || ringSc.sigmaPhase <= 0)) {
      throw new Error("star.photometry.ringScattering.sigmaPhase must be finite and > 0 if provided.");
    }
  }

  if (usesHigherFidelityAdditiveComposition(params)) {
    const phot = params.star.photometry;
    if (
      hasActiveHigherFidelityAdditiveChannels(params) &&
      phot?.additiveComposition !== "higher-fidelity-coupled"
    ) {
      throw new Error(
        'higher-fidelity additive composition requires star.photometry.additiveComposition = "higher-fidelity-coupled" when additive body-light channels are active.',
      );
    }
    const rtEmission = phot?.atmosphereRT?.enabled ? phot.atmosphereRT.emission : undefined;
    const rtTarget = phot?.atmosphereRT?.target ?? "planet";
    const emissionActive = Boolean(
      rtEmission?.enabled && Number.isFinite(rtEmission.amp) && (rtEmission.amp as number) > 0,
    );
    if (emissionActive) {
      if (rtTarget === "planet" && hasActiveThermalPhaseChannel(phot?.phaseCurve, params)) {
        throw new Error(
          "higher-fidelity additive composition rejects star.photometry.atmosphereRT.emission together with an active planet thermal phase channel.",
        );
      }
      if (rtTarget === "moon" && hasActiveThermalPhaseChannel(phot?.moonPhaseCurve, params)) {
        throw new Error(
          "higher-fidelity additive composition rejects star.photometry.atmosphereRT.emission together with an active moon thermal phase channel.",
        );
      }
    }

    const forwardSc = phot?.forwardScattering;
    const ringSc = phot?.ringScattering;
    if (
      forwardSc?.enabled &&
      Number.isFinite(forwardSc.amp) &&
      (forwardSc.amp as number) > 0 &&
      hasActiveReflectedPhaseChannel(phot?.phaseCurve)
    ) {
      throw new Error(
        "higher-fidelity additive composition rejects star.photometry.forwardScattering together with an active reflected planet phase channel.",
      );
    }

    if (
      ringSc?.enabled &&
      Number.isFinite(ringSc.amp) &&
      (ringSc.amp as number) > 0 &&
      params.planet.rings &&
      hasActiveReflectedPhaseChannel(phot?.phaseCurve)
    ) {
      throw new Error(
        "higher-fidelity additive composition rejects star.photometry.ringScattering together with an active reflected planet phase channel.",
      );
    }
  }
}
