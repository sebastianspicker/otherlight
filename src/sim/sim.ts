// src/sim/sim.ts
//
// Core simulation stepper.
// - Computes planet & moon positions from Keplerian elements in inertial frame.
// - Projects them into the observer sky plane.
// - Computes normalized stellar flux reduction due to occultations (planet/moon transits). 
//
// Photometry models (selection happens here; finite-exposure smearing is handled outside): 
// - Uniform stellar disk (no patches): analytic for 1 occulter; robust numeric union integral for >=2.
// - Uniform stellar disk + brightness patches (spots/faculae): numeric midpoint integral (always).
// - Limb darkening: quadratic (legacy) OR multi-law via limbDarkeningModel: numeric midpoint integral (always).
// - Optional additive planet & moon light (reflection + thermal emission): phase curve terms added in stellar units.
//
// Conventions (matches existing repo): 
// - Observer direction points from the star toward the observer.
// - projectToSky returns (x,y) in the sky plane, and z = depth along observer direction.
// - Bodies are considered "in front" (able to occult) when vDot(rBody, observerDir) > 0.
// - In-front ordering for mutual events uses sky depth: larger z => closer to observer.
//
// Normalization & combination (current convention): 
// - Transit photometry returns multiplicative stellar attenuation F_transit(t) in ~[0,1].
// - Out-of-transit components are additive in "stellar units":
//     F_total(t) = (baselineFlux + f_planet(t) + f_moon(t) + f_var(t)) * F_transit(t)
//
// Secondary eclipse (occultation) handling (minimal): 
// - If a body is behind the star (sky.z < 0) AND its projected center lies inside the stellar disk,
//   its additive phase term is set to 0 for that timestep.
// - Ignores partial occultation and finite body radius (deliberately minimal & robust).
//
// Planet–moon barycentric wobble (TTV/TDV): 
// - If both planet.m and moon.m are provided (>0), planet.orbit is interpreted as barycenter orbit,
//   and the planet/moon positions are split around rBary using the moon relative orbit vector.
//
// Mutual events: 
// - If one body is in front of the other and their disks overlap, the occulted body's additive
//   self-flux is multiplied by the visible fraction of its disk. 
//
// Time-dependent elements: 
// - posFromElements accepts OrbitElements or OrbitElementsProvider(t)->OrbitElements.
//

import type { OrbitElements, OrbitElementsProvider, StepResult, SystemParams } from "../core/types";
import type Vec3 from "../physics/vec3";

import { vAdd, vDot, vIsFinite, vNormalizeOrThrow } from "../physics/vec3";
import { solveKeplerE, radiusFromE, trueAnomalyFromE } from "../physics/kepler";
import { perifocalToInertial, projectToSky } from "../physics/frames";

import { fluxUniformDisk, type Occulter } from "../photometry/transitUniform";
import { fluxUniformDiskWithPatches } from "../photometry/transitUniformSpots";
import { fluxLimbDarkenedDiskQuadratic } from "../photometry/transitQuadraticLD";

// Keep only planetPhaseFlux as hard dependency (repo-compatible).
import { planetPhaseFlux } from "../photometry/phaseCurve";
import { stellarVariabilityFlux } from "../photometry/stellarVariability";

import { trySplitBarycentricPair } from "../physics/barycenter";
import { visibleFractionWhenOcculted } from "../photometry/mutualEvents";

// Optional: exomoon timing/shape helpers (if module exists in your repo).
import type { ExomoonTimingShapeParams } from "../core/types";
import {
  applyOrientationEvolution,
  estimateSkyPlaneSpeed,
  impactParameterFromSkyY,
  tdvRatioFromSkyPlaneSpeeds,
} from "../physics/exomoonTiming";

/* -----------------------------
 * Optional module hooks (guarded via dynamic import)
 * ----------------------------- */

type FluxLimbDarkenedDiskFn = (args: {
  rStar: number;
  rOcculters: Occulter[];
  limbDarkeningLaw: unknown;
  constraints?: unknown;
  brightnessPatches?: unknown;
  gridRes?: number;
}) => number;

type ResolveLimbDarkeningForBandFn = (model: unknown, bandpass?: unknown) => unknown;

let fluxLimbDarkenedDiskOpt: FluxLimbDarkenedDiskFn | null = null;
let resolveLimbDarkeningForBandOpt: ResolveLimbDarkeningForBandFn | null = null;
let optionalLdTried = false;

async function ensureOptionalLimbDarkeningLoaded(): Promise<void> {
  if (optionalLdTried) return;
  optionalLdTried = true;

  try {
    // Support BOTH default and named exports to avoid “no default export” issues. [web:59]
    const m1: any = await import("../photometry/transitLimbDarkened");
    fluxLimbDarkenedDiskOpt = (m1?.default ?? m1?.fluxLimbDarkenedDisk ?? null) as FluxLimbDarkenedDiskFn | null;

    const m2: any = await import("../photometry/limbDarkening");
    resolveLimbDarkeningForBandOpt = (m2?.resolveLimbDarkeningForBand ?? null) as ResolveLimbDarkeningForBandFn | null;

    if (!fluxLimbDarkenedDiskOpt || !resolveLimbDarkeningForBandOpt) {
      fluxLimbDarkenedDiskOpt = null;
      resolveLimbDarkeningForBandOpt = null;
    }
  } catch {
    fluxLimbDarkenedDiskOpt = null;
    resolveLimbDarkeningForBandOpt = null;
  }
}

/* -----------------------------
 * Basic validation helpers
 * ----------------------------- */

function assertOrbit(el: OrbitElements, name: string): void {
  if (!Number.isFinite(el.a) || el.a <= 0) throw new Error(`${name}.a must be > 0`);
  if (!Number.isFinite(el.e) || el.e < 0 || el.e >= 1) throw new Error(`${name}.e must be in [0, 1)`);
  if (!Number.isFinite(el.period) || el.period <= 0) throw new Error(`${name}.period must be > 0`);
  if (!Number.isFinite(el.inc)) throw new Error(`${name}.inc must be finite`);
  if (!Number.isFinite(el.Omega)) throw new Error(`${name}.Omega must be finite`);
  if (!Number.isFinite(el.omega)) throw new Error(`${name}.omega must be finite`);
  if (!Number.isFinite(el.t0)) throw new Error(`${name}.t0 must be finite`);
}

function getObserverDir(params: SystemParams): Vec3 {
  const dir = params.observer?.dir ?? { x: 0, y: 0, z: 1 };
  if (!vIsFinite(dir)) throw new Error("observer.dir must be finite.");
  return vNormalizeOrThrow(dir, 1e-15, "observer.dir must be non-zero.");
}

function resolveOrbitElements(elOrProvider: OrbitElements | OrbitElementsProvider, t: number, nameForErrors: string): OrbitElements {
  const el = typeof elOrProvider === "function" ? elOrProvider(t) : elOrProvider;
  assertOrbit(el, nameForErrors);
  return el;
}

function posFromElements(elOrProvider: OrbitElements | OrbitElementsProvider, t: number, nameForErrors: string): Vec3 {
  const el = resolveOrbitElements(elOrProvider, t, nameForErrors);

  const n = (2 * Math.PI) / el.period;
  const M = n * (t - el.t0);

  const E = solveKeplerE(M, el.e);
  const nu = trueAnomalyFromE(E, el.e);
  const r = radiusFromE(el.a, el.e, E);

  const rPQW: Vec3 = { x: r * Math.cos(nu), y: r * Math.sin(nu), z: 0 };
  return perifocalToInertial(rPQW, el.Omega, el.inc, el.omega);
}

function toFiniteNumber(v: unknown, fallback: number): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeVelDtSec(v: unknown, fallback: number): number {
  const dt = toFiniteNumber(v, fallback);
  return Math.max(1e-6, dt);
}

function getExomoonConfig(params: SystemParams): ExomoonTimingShapeParams | undefined {
  return params.dynamics?.exomoonTimingShape;
}

/* -----------------------------
 * Geometric helpers
 * ----------------------------- */

function couldOverlapStarOnSky(dx: number, dy: number, rOcc: number, rStar: number): boolean {
  return Math.hypot(dx, dy) < rStar + rOcc;
}

function isBodyOccultedByStarMinimal(bodySky: { x: number; y: number; z: number }, rStar: number): boolean {
  if (!Number.isFinite(bodySky.x) || !Number.isFinite(bodySky.y) || !Number.isFinite(bodySky.z)) return false;
  if (!Number.isFinite(rStar) || rStar <= 0) return false;
  if (bodySky.z >= 0) return false;
  return Math.hypot(bodySky.x, bodySky.y) < rStar;
}

type BodyKinematics = {
  rBary: Vec3;
  rPlanetAbs: Vec3;
  rMoonAbs?: Vec3;
  planetSky: { x: number; y: number; z: number };
  moonSky?: { x: number; y: number; z: number };
};

function computeBodyKinematics(params: SystemParams, t: number, observerDir: Vec3): BodyKinematics {
  const rBary = posFromElements(params.planet.orbit, t, "planet.orbit");

  let rPlanetAbs: Vec3 = rBary;
  let rMoonAbs: Vec3 | undefined;
  let moonSky: { x: number; y: number; z: number } | undefined;

  const exo = getExomoonConfig(params);
  const exoEnabled = Boolean(exo?.enabled);
  const tRef = toFiniteNumber(exo?.tRef, 0);

  if (params.moon) {
    if (!Number.isFinite(params.moon.r) || params.moon.r <= 0) throw new Error("moon.r must be > 0");

    const moonOrbitBase = params.moon.orbitAroundPlanet;
    const moonOrbitEvolved = exoEnabled
      ? applyOrientationEvolution(moonOrbitBase, t, {
          enabled: true,
          tRef,
          OmegaDot: exo?.moonOmegaDot,
          incDot: exo?.moonIncDot,
          omegaDot: exo?.moonOmegaSmallDot,
          Omega0: exo?.moonOmega0,
          inc0: exo?.moonInc0,
          omega0: exo?.moonOmegaSmall0,
          wrapAngles: "2pi",
          clampInc01Pi: true,
        })
      : moonOrbitBase;

    const rMoonRel = posFromElements(moonOrbitEvolved, t, "moon.orbitAroundPlanet");

    const split = trySplitBarycentricPair({
      rBary,
      rRel: rMoonRel,
      mPrimary: params.planet.m,
      mSecondary: params.moon.m,
    });

    if (split) {
      rPlanetAbs = split.rPrimary;
      rMoonAbs = split.rSecondary;
    } else {
      rMoonAbs = vAdd(rBary, rMoonRel);
    }

    moonSky = projectToSky(rMoonAbs as Vec3, observerDir);
  }

  const planetSky = projectToSky(rPlanetAbs, observerDir);
  return { rBary, rPlanetAbs, rMoonAbs, planetSky, moonSky };
}

function buildOcculters(params: SystemParams, observerDir: Vec3, kin: BodyKinematics): Occulter[] {
  const occulters: Occulter[] = [];

  const planetInFront = vDot(kin.rPlanetAbs, observerDir) > 0;
  if (planetInFront && couldOverlapStarOnSky(kin.planetSky.x, kin.planetSky.y, params.planet.r, params.star.r)) {
    occulters.push({ dx: kin.planetSky.x, dy: kin.planetSky.y, r: params.planet.r });
  }

  if (params.moon && kin.rMoonAbs && kin.moonSky) {
    const moonInFront = vDot(kin.rMoonAbs, observerDir) > 0;
    if (moonInFront && couldOverlapStarOnSky(kin.moonSky.x, kin.moonSky.y, params.moon.r, params.star.r)) {
      occulters.push({ dx: kin.moonSky.x, dy: kin.moonSky.y, r: params.moon.r });
    }
  }

  return occulters;
}

function computeTransitFlux(params: SystemParams, occulters: Occulter[]): number {
  const phot = params.star.photometry;
  const patches = phot?.brightnessPatches;
  const gridRes = phot?.gridRes;

  const ldLegacy = phot?.limbDarkening;
  const useLegacyQuadraticLD = Boolean(ldLegacy && Number.isFinite(ldLegacy.u1) && Number.isFinite(ldLegacy.u2));

  // Optional LD model: only if the optional modules are actually loadable.
  const ldModel = phot?.limbDarkeningModel;
  const tryNewLD = Boolean(ldModel);

  // IMPORTANT: cannot await here; stepSystem is sync.
  // So we only use optional LD if it has already been loaded (e.g., by a preloader).
  if (tryNewLD && fluxLimbDarkenedDiskOpt && resolveLimbDarkeningForBandOpt) {
    const ldLaw = resolveLimbDarkeningForBandOpt(ldModel, (ldModel as any)?.bandpass);
    if (ldLaw) {
      return fluxLimbDarkenedDiskOpt({
        rStar: params.star.r,
        rOcculters: occulters,
        limbDarkeningLaw: ldLaw,
        constraints: (ldModel as any)?.constraints,
        brightnessPatches: patches,
        gridRes,
      });
    }
  }

  const hasPatches = Boolean(patches && patches.length > 0);

  if (useLegacyQuadraticLD) {
    return fluxLimbDarkenedDiskQuadratic({
      rStar: params.star.r,
      rOcculters: occulters,
      limbDarkening: ldLegacy!,
      brightnessPatches: patches,
      gridRes,
    });
  }

  if (hasPatches) {
    return fluxUniformDiskWithPatches({
      rStar: params.star.r,
      rOcculters: occulters,
      brightnessPatches: patches,
      gridRes,
    });
  }

  return fluxUniformDisk({
    rStar: params.star.r,
    rOcculters: occulters,
    gridRes,
  });
}

type AdditiveFluxComponents = {
  fluxPlanetOnly: number;
  fluxMoonOnly: number;
  fluxStellarVarOnly: number;
  planetVisibleFraction?: number;
  moonVisibleFraction?: number;
};

function computeAdditiveFluxComponents(params: SystemParams, t: number, observerDir: Vec3, kin: BodyKinematics): AdditiveFluxComponents {
  const phot = params.star.photometry;

  let fluxPlanetOnly = planetPhaseFlux({
    rPlanet: kin.rPlanetAbs,
    observerDir,
    model: phot?.phaseCurve,
  });

  // Robust fallback: use planetPhaseFlux also for moon (existing repo behavior). 
  let fluxMoonOnly = 0;
  if (params.moon && kin.rMoonAbs) {
    fluxMoonOnly = planetPhaseFlux({
      rPlanet: kin.rMoonAbs,
      observerDir,
      model: phot?.moonPhaseCurve,
    });
  }

  if (fluxPlanetOnly > 0 && isBodyOccultedByStarMinimal(kin.planetSky, params.star.r)) fluxPlanetOnly = 0;
  if (fluxMoonOnly > 0 && kin.moonSky && isBodyOccultedByStarMinimal(kin.moonSky, params.star.r)) fluxMoonOnly = 0;

  let planetVisibleFraction: number | undefined;
  let moonVisibleFraction: number | undefined;

  if (kin.moonSky) {
    if (fluxPlanetOnly > 0) {
      const visPlanet = visibleFractionWhenOcculted({
        targetSky: kin.planetSky,
        occulterSky: kin.moonSky,
        rTarget: params.planet.r,
        rOcculter: params.moon?.r ?? NaN,
      });

      if (Number.isFinite(visPlanet)) {
        planetVisibleFraction = visPlanet;
        fluxPlanetOnly *= visPlanet;
      }
    }

    if (fluxMoonOnly > 0) {
      const visMoon = visibleFractionWhenOcculted({
        targetSky: kin.moonSky,
        occulterSky: kin.planetSky,
        rTarget: params.moon?.r ?? NaN,
        rOcculter: params.planet.r,
      });

      if (Number.isFinite(visMoon)) {
        moonVisibleFraction = visMoon;
        fluxMoonOnly *= visMoon;
      }
    }
  }

  const fluxStellarVarOnly = stellarVariabilityFlux({
    t,
    orbit: resolveOrbitElements(params.planet.orbit as OrbitElements | OrbitElementsProvider, t, "planet.orbit"),
    model: phot?.stellarVariability,
  });

  return { fluxPlanetOnly, fluxMoonOnly, fluxStellarVarOnly, planetVisibleFraction, moonVisibleFraction };
}

type ExoDiagnostics = {
  vPlanetSky?: number;
  vPlanetSkyRef?: number;
  tdvRatio?: number;
  bPlanet?: number;
  bMoon?: number;
};

function computeExoDiagnostics(params: SystemParams, t: number, observerDir: Vec3, kin: BodyKinematics): ExoDiagnostics {
  const exo = getExomoonConfig(params);
  const exoEnabled = Boolean(exo?.enabled);
  if (!exoEnabled) return {};

  const tRef = toFiniteNumber(exo?.tRef, 0);
  const velDt = normalizeVelDtSec(exo?.velDt, 2.0);

  const planetAbsAt = (ti: number): Vec3 => {
    const rB = posFromElements(params.planet.orbit, ti, "planet.orbit");
    if (!params.moon) return rB;

    const moonOrbitBase = params.moon.orbitAroundPlanet;
    const moonOrbitEvolved = applyOrientationEvolution(moonOrbitBase, ti, {
      enabled: true,
      tRef,
      OmegaDot: exo?.moonOmegaDot,
      incDot: exo?.moonIncDot,
      omegaDot: exo?.moonOmegaSmallDot,
      Omega0: exo?.moonOmega0,
      inc0: exo?.moonInc0,
      omega0: exo?.moonOmegaSmall0,
      wrapAngles: "2pi",
      clampInc01Pi: true,
    });

    const rRel = posFromElements(moonOrbitEvolved, ti, "moon.orbitAroundPlanet");
    const split = trySplitBarycentricPair({
      rBary: rB,
      rRel,
      mPrimary: params.planet.m,
      mSecondary: params.moon.m,
    });

    return split ? split.rPrimary : rB;
  };

  const vPlanetSky = estimateSkyPlaneSpeed(planetAbsAt, t, observerDir, { dtSec: velDt, central: true });
  const vPlanetSkyRef = estimateSkyPlaneSpeed(planetAbsAt, tRef, observerDir, { dtSec: velDt, central: true });

  let tdvRatio: number | undefined;
  if (Number.isFinite(vPlanetSkyRef) && Number.isFinite(vPlanetSky)) {
    const r = tdvRatioFromSkyPlaneSpeeds(vPlanetSkyRef!, vPlanetSky!);
    if (Number.isFinite(r)) tdvRatio = r;
  }

  const bPlanet = impactParameterFromSkyY(kin.planetSky.y, params.star.r);
  const bMoon = kin.moonSky ? impactParameterFromSkyY(kin.moonSky.y, params.star.r) : undefined;

  return { vPlanetSky, vPlanetSkyRef, tdvRatio, bPlanet, bMoon };
}

/* -----------------------------
 * Public API
 * ----------------------------- */

export function sampleOrbitSky(
  elOrProvider: OrbitElements | OrbitElementsProvider,
  tStart: number,
  samples = 256,
  observerDir?: Vec3
): Array<{ x: number; y: number; z: number }> {
  const N = Math.max(16, Math.floor(samples));
  const dir = observerDir ?? { x: 0, y: 0, z: 1 };
  const pts: Array<{ x: number; y: number; z: number }> = [];

  const el0 = resolveOrbitElements(elOrProvider, tStart, "orbit");
  const period0 = el0.period;

  for (let i = 0; i < N; i++) {
    const tt = tStart + (i / N) * period0;
    const r = posFromElements(elOrProvider, tt, "orbit");
    pts.push(projectToSky(r, dir));
  }

  return pts;
}

export function stepSystem(params: SystemParams, t: number): StepResult {
  if (!params.star || !params.planet) throw new Error("stepSystem: missing star/planet params.");
  if (!Number.isFinite(params.star.r) || params.star.r <= 0) throw new Error("star.r must be > 0");
  if (!Number.isFinite(params.planet.r) || params.planet.r <= 0) throw new Error("planet.r must be > 0");
  if (!Number.isFinite(t)) throw new Error("stepSystem: t must be finite");

  const observerDir = getObserverDir(params);

  const kin = computeBodyKinematics(params, t, observerDir);
  const occulters = buildOcculters(params, observerDir, kin);

  const fluxTransitOnly = computeTransitFlux(params, occulters);
  const additive = computeAdditiveFluxComponents(params, t, observerDir, kin);

  const phot = params.star.photometry;
  const baselineFluxUsed = Number.isFinite(phot?.baselineFlux as number) ? (phot!.baselineFlux as number) : 1.0;

  const fluxTotal =
    (baselineFluxUsed + additive.fluxPlanetOnly + additive.fluxMoonOnly + additive.fluxStellarVarOnly) * fluxTransitOnly;

  const exoDiag = computeExoDiagnostics(params, t, observerDir, kin);

  return {
    flux: fluxTotal,
    fluxTransitOnly,
    fluxPhaseOnly: additive.fluxPlanetOnly,
    fluxTotal,
    planetSky: kin.planetSky,
    moonSky: kin.moonSky,
    meta: {
      t,
      nOcculters: occulters.length,
      planetVisibleFraction: additive.planetVisibleFraction,
      moonVisibleFraction: additive.moonVisibleFraction,
      stellarVariabilityFlux: additive.fluxStellarVarOnly,
      baselineFluxUsed,
      vPlanetSky: exoDiag.vPlanetSky,
      vPlanetSkyRef: exoDiag.vPlanetSkyRef,
      tdvRatio: exoDiag.tdvRatio,
      bPlanet: exoDiag.bPlanet,
      bMoon: exoDiag.bMoon,
    },
  };
}

export function sampleMoonOrbitSkyAbsolute(
  params: SystemParams,
  tStart: number,
  samples = 256
): Array<{ x: number; y: number; z: number }> {
  if (!params.moon) return [];
  if (!Number.isFinite(tStart)) throw new Error("sampleMoonOrbitSkyAbsolute: tStart must be finite");

  const observerDir = getObserverDir(params);
  const N = Math.max(16, Math.floor(samples));
  const pts: Array<{ x: number; y: number; z: number }> = [];

  const moonPeriod = params.moon.orbitAroundPlanet.period;
  if (!Number.isFinite(moonPeriod) || moonPeriod <= 0) throw new Error("moon.orbitAroundPlanet.period must be > 0");

  const exo = getExomoonConfig(params);
  const exoEnabled = Boolean(exo?.enabled);
  const tRef = toFiniteNumber(exo?.tRef, 0);

  for (let i = 0; i < N; i++) {
    const tt = tStart + (i / N) * moonPeriod;

    const rBary = posFromElements(params.planet.orbit, tt, "planet.orbit");

    const moonOrbitBase = params.moon.orbitAroundPlanet;
    const moonOrbitEvolved = exoEnabled
      ? applyOrientationEvolution(moonOrbitBase, tt, {
          enabled: true,
          tRef,
          OmegaDot: exo?.moonOmegaDot,
          incDot: exo?.moonIncDot,
          omegaDot: exo?.moonOmegaSmallDot,
          Omega0: exo?.moonOmega0,
          inc0: exo?.moonInc0,
          omega0: exo?.moonOmegaSmall0,
          wrapAngles: "2pi",
          clampInc01Pi: true,
        })
      : moonOrbitBase;

    const rMoonRel = posFromElements(moonOrbitEvolved, tt, "moon.orbitAroundPlanet");

    const split = trySplitBarycentricPair({
      rBary,
      rRel: rMoonRel,
      mPrimary: params.planet.m,
      mSecondary: params.moon.m,
    });

    const rMoonAbs = split ? split.rSecondary : vAdd(rBary, rMoonRel);
    pts.push(projectToSky(rMoonAbs, observerDir));
  }

  return pts;
}

// Optional: call this once early (e.g., from main.ts) if you want optional LD to be used when configured.
export async function preloadOptionalLimbDarkening(): Promise<void> {
  await ensureOptionalLimbDarkeningLoaded();
}
