// src/sim/validation.ts
//
// Centralized validation helpers (ported from the original monolithic sim.ts).
// Keep these checks strict and early to preserve “fail fast” behavior.

import type { OrbitElements, OrbitElementsProvider, SystemParams } from "../core/types";
import { isFiniteNonNegative, isFinitePositive } from "../core/units";

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
  rings: { innerRadius: number; outerRadius: number } | undefined,
  name: string
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
}

export function assertOrbit(el: OrbitElements, name: string): void {
  if (!el || typeof el !== "object") throw new Error(`${name} must be an object.`);
  if (!Number.isFinite(el.a) || el.a <= 0) throw new Error(`${name}.a must be > 0`);
  if (!Number.isFinite(el.e) || el.e < 0 || el.e >= 1) throw new Error(`${name}.e must be in [0, 1)`);
  if (!Number.isFinite(el.period) || el.period <= 0) throw new Error(`${name}.period must be > 0`);

  // Angles and epoch must be finite (angles are radians by project convention).
  if (!Number.isFinite(el.inc)) throw new Error(`${name}.inc must be finite`);
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
  if (params.moon) {
    assertOblateness(params.moon.shape, "moon");
    assertRings(params.moon.rings, "moon");
  }

  // Orbits must be present and valid (static or provider).
  if (!params.planet.orbit) throw new Error("planet.orbit must be provided.");
  assertOrbitProvider(params.planet.orbit, "planet.orbit");

  if (params.moon) {
    if (!params.moon.orbitAroundPlanet) throw new Error("moon.orbitAroundPlanet must be provided when moon exists.");
    assertOrbitProvider(params.moon.orbitAroundPlanet, "moon.orbitAroundPlanet");
  }

  const nbody = params.dynamics?.nbodyPlanetMoon;
  if (nbody?.enabled) {
    if (!params.moon) throw new Error("nbody enabled requires a moon configuration.");
    if (typeof params.planet.orbit === "function") {
      throw new Error("nbody requires a static planet.orbit (initial conditions, not a function provider).");
    }
    if (typeof params.moon.orbitAroundPlanet === "function") {
      throw new Error("nbody requires a static moon.orbitAroundPlanet (initial conditions, not a function provider).");
    }
    if (!isFinitePositive(nbody.muStar)) throw new Error("nbody.muStar must be > 0 when enabled.");
    if (!isFinitePositive(nbody.muPlanet)) throw new Error("nbody.muPlanet must be > 0 when enabled.");
    if (!isFinitePositive(nbody.muMoon)) throw new Error("nbody.muMoon must be > 0 when enabled.");
    if (!isFinitePositive(nbody.dtMax)) throw new Error("nbody.dtMax must be > 0 when enabled.");
    if (nbody.softening !== undefined && (!Number.isFinite(nbody.softening) || nbody.softening < 0)) {
      throw new Error("nbody.softening must be finite and >= 0 if provided.");
    }

    const pert = Array.isArray(nbody.perturbers) ? nbody.perturbers : [];
    for (let i = 0; i < pert.length; i++) {
      const p = pert[i] as any;
      if (!p || p.enabled === false) continue;
      if (!isFinitePositive(p.mu)) {
        throw new Error(`nbody.perturbers[${i}].mu must be > 0 when enabled.`);
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
    if (ti.emissivity !== undefined && (!Number.isFinite(ti.emissivity) || ti.emissivity < 0 || ti.emissivity > 1)) {
      throw new Error("phaseCurve.thermalInertia.emissivity must be in [0,1] if provided.");
    }
    if (ti.thermalTimescaleSec !== undefined && (!Number.isFinite(ti.thermalTimescaleSec) || ti.thermalTimescaleSec < 0)) {
      throw new Error("phaseCurve.thermalInertia.thermalTimescaleSec must be >= 0 if provided.");
    }
    if (ti.redistribution !== undefined && (!Number.isFinite(ti.redistribution) || ti.redistribution < 0 || ti.redistribution > 1)) {
      throw new Error("phaseCurve.thermalInertia.redistribution must be in [0,1] if provided.");
    }
  }

  const moonPhase = params.star.photometry?.moonPhaseCurve;
  if (moonPhase?.thermalInertia?.enabled) {
    const ti = moonPhase.thermalInertia;
    if (ti.albedo !== undefined && (!Number.isFinite(ti.albedo) || ti.albedo < 0 || ti.albedo > 1)) {
      throw new Error("moonPhaseCurve.thermalInertia.albedo must be in [0,1] if provided.");
    }
    if (ti.emissivity !== undefined && (!Number.isFinite(ti.emissivity) || ti.emissivity < 0 || ti.emissivity > 1)) {
      throw new Error("moonPhaseCurve.thermalInertia.emissivity must be in [0,1] if provided.");
    }
    if (ti.thermalTimescaleSec !== undefined && (!Number.isFinite(ti.thermalTimescaleSec) || ti.thermalTimescaleSec < 0)) {
      throw new Error("moonPhaseCurve.thermalInertia.thermalTimescaleSec must be >= 0 if provided.");
    }
    if (ti.redistribution !== undefined && (!Number.isFinite(ti.redistribution) || ti.redistribution < 0 || ti.redistribution > 1)) {
      throw new Error("moonPhaseCurve.thermalInertia.redistribution must be in [0,1] if provided.");
    }
  }

  const spot = params.star.photometry?.spotEvolution;
  if (spot?.enabled) {
    const period = spot.rotationPeriodSec;
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
}

export type UiValidationSeverity = "info" | "warn";

export type UiValidationMessage = {
  severity: UiValidationSeverity;
  code: string;
  message: string;
  details?: Record<string, unknown>;
};

/**
 * Collect non-fatal parameter warnings for UI display.
 * These are soft checks meant to flag likely unphysical or numerically risky setups.
 */
export function collectParamWarnings(params: SystemParams): UiValidationMessage[] {
  const out: UiValidationMessage[] = [];

  const starR = params.star?.r;
  const planet = params.planet;
  const pOrbit = planet?.orbit as OrbitElements | undefined;

  if (planet && pOrbit && Number.isFinite(pOrbit.a) && Number.isFinite(pOrbit.e)) {
    const eP = pOrbit.e;
    const aP = pOrbit.a;

    if (eP >= 0.95 && eP < 1) {
      out.push({
        severity: "warn",
        code: "HIGH_ECC_PLANET",
        message: `Hohe Planeten-Exzentrizitaet (e=${eP.toFixed(3)}). Periastron kann numerisch anspruchsvoll sein.`,
      });
    }

    if (Number.isFinite(starR) && starR > 0) {
      const qP = aP * (1 - eP);
      if (Number.isFinite(qP) && qP <= starR) {
        out.push({
          severity: "warn",
          code: "PLANET_PERIA_INSIDE_STAR",
          message: "Planet-Periapsis liegt im Sternradius (Kollision/Unphysikalisch).",
        });
      }

      if (Number.isFinite(planet.r) && planet.r > 0 && planet.r >= starR) {
        out.push({
          severity: "warn",
          code: "PLANET_LARGER_THAN_STAR",
          message: "Planetenradius ist >= Sternradius; typischerweise unphysikalisch.",
        });
      }
    }
  }

  const moon = params.moon;
  const mOrbit = moon?.orbitAroundPlanet as OrbitElements | undefined;
  if (moon && mOrbit && Number.isFinite(mOrbit.a) && Number.isFinite(mOrbit.e)) {
    const eM = mOrbit.e;
    const aM = mOrbit.a;

    if (eM >= 0.95 && eM < 1) {
      out.push({
        severity: "warn",
        code: "HIGH_ECC_MOON",
        message: `Hohe Mond-Exzentrizitaet (e=${eM.toFixed(3)}). Perizentrum kann unphysikalisch werden.`,
      });
    }

    if (planet && Number.isFinite(planet.r) && planet.r > 0) {
      const qM = aM * (1 - eM);
      if (Number.isFinite(qM) && qM <= planet.r) {
        out.push({
          severity: "warn",
          code: "MOON_PERIA_INSIDE_PLANET",
          message: "Mond-Perizentrum liegt im Planetenradius (Kollision/Unphysikalisch).",
        });
      }
    }

    if (planet && Number.isFinite(moon.r) && Number.isFinite(planet.r) && moon.r >= planet.r) {
      out.push({
        severity: "warn",
        code: "MOON_LARGER_THAN_PLANET",
        message: "Mondradius ist >= Planetenradius; typischerweise unphysikalisch.",
      });
    }
  }

  const phot = params.star?.photometry;
  const gridRes = phot?.gridRes;
  if (Number.isFinite(gridRes) && gridRes > 0 && gridRes < 40) {
    out.push({
      severity: "info",
      code: "LOW_GRID_RES",
      message: "gridRes ist sehr niedrig; Transit-Genauigkeit kann leiden.",
    });
  }

  if (phot?.spotEvolution?.enabled) {
    const hasPatches = Array.isArray(phot.brightnessPatches) && phot.brightnessPatches.length > 0;
    if (!hasPatches) {
      out.push({
        severity: "info",
        code: "SPOT_EVOLUTION_NO_PATCHES",
        message: "Spot-Evolution ist aktiv, aber es sind keine Brightness-Patches definiert.",
      });
    }
  }

  const nbody = params.dynamics?.nbodyPlanetMoon;
  const exo = params.dynamics?.exomoonTimingShape;
  if (nbody?.enabled && exo?.enabled) {
    out.push({
      severity: "info",
      code: "NBODY_EXO_OVERRIDES",
      message: "N-body ist aktiv; Exomoon-Timing/Shape wird fuer die Mondbahn ignoriert.",
    });
  }

  const rel = params.dynamics?.relativity;
  if (nbody?.enabled && rel?.enabled && rel.grPrecession !== false) {
    const planetOverride = Number.isFinite(rel.planetPrecessionPerOrbit) && rel.planetPrecessionPerOrbit !== 0;
    const moonOverride = Number.isFinite(rel.moonPrecessionPerOrbit) && rel.moonPrecessionPerOrbit !== 0;
    if (planetOverride || moonOverride) {
      out.push({
        severity: "info",
        code: "NBODY_GR_OVERRIDE_IGNORED",
        message:
          "N-body ist aktiv; GR nutzt 1PN-Korrektur (Stern-zentrisch). Per-Orbit-Overrides werden ignoriert.",
      });
    }
  }

  const atm = phot?.atmosphereTransmission;
  if (atm?.enabled) {
    const lambdaNm = Array.isArray(atm.lambdaNm) ? atm.lambdaNm : [];
    const tauScale = Array.isArray(atm.tauScale) ? atm.tauScale : [];
    if (lambdaNm.length > 0 && tauScale.length > 1 && tauScale.length !== lambdaNm.length) {
      out.push({
        severity: "info",
        code: "ATM_LAMBDA_TAUSCALE_MISMATCH",
        message: "lambdaNm und tauScale haben unterschiedliche Laengen; tauScale wird als 1.0 behandelt.",
      });
    }
  }

  const cadenceSec = phot?.cadenceSec;
  const nSub = phot?.nSubsamples;
  if (Number.isFinite(cadenceSec) && cadenceSec > 0 && Number.isFinite(nSub) && nSub <= 1) {
    out.push({
      severity: "info",
      code: "SMEARING_DISABLED",
      message: "cadenceSec > 0 aber nSubsamples <= 1; Smearing ist effektiv aus.",
    });
  }

  return out;
}
