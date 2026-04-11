// src/sim/additiveFlux.ts

import type {
  AtmosphereRTParams,
  PhaseCurveParams,
  SystemParams,
  ThermalModelAdvancedParams,
} from "../core/types";
import { clamp, toFiniteNumber } from "../core/units";
import type { Vec3 } from "../physics/vec3";
import { bodyPhaseFlux } from "../photometry/phaseCurve";
import { orbitalPhaseFromPeriod, stellarVariabilityFlux } from "../photometry/stellarVariability";
import { computeForwardScatteringFlux } from "../photometry/forwardScattering";
import { visibleFractionWhenOcculted } from "../photometry/mutualEvents";
import { phaseAngleRadFromBodyPos } from "../photometry/dayNightVisibility";
import { fluxUniformDisk } from "../photometry/transitUniform";
import type { CircleOcculter } from "../photometry/occulterCircle";
import type { BodyKinematics } from "./kinematics";
import { resolveOrbitElements } from "./orbits";
import { isPhysicsFeatureEnabled } from "./fidelity";

const MUTUAL_OCCULTER_GRID_RES = 120;

function addOcculterIfFront(
  occulters: CircleOcculter[],
  targetSky: { x: number; y: number; z: number },
  occulterSky: { x: number; y: number; z: number },
  rOcculter: number,
): void {
  if (!Number.isFinite(rOcculter) || rOcculter <= 0) return;
  if (
    !Number.isFinite(targetSky.x) ||
    !Number.isFinite(targetSky.y) ||
    !Number.isFinite(targetSky.z) ||
    !Number.isFinite(occulterSky.x) ||
    !Number.isFinite(occulterSky.y) ||
    !Number.isFinite(occulterSky.z)
  ) {
    return;
  }

  if (!(occulterSky.z > targetSky.z)) return;

  occulters.push({
    dx: occulterSky.x - targetSky.x,
    dy: occulterSky.y - targetSky.y,
    r: rOcculter,
  });
}

function visibleFractionWithOcculters(rTarget: number, occulters: CircleOcculter[]): number {
  if (!Number.isFinite(rTarget) || rTarget <= 0) return 1;
  if (occulters.length === 0) return 1;

  try {
    return fluxUniformDisk({
      rStar: rTarget,
      rOcculters: occulters,
      gridRes: MUTUAL_OCCULTER_GRID_RES,
    });
  } catch {
    // Fail-open: grid-based occlusion computation failed; assume full visibility (flux = 1).
    return 1;
  }
}

function effectiveProjectedRadius(body: {
  r: number;
  shape?: { oblateness?: number };
  rings?: { outerRadius: number };
}): number {
  const rBody = Number.isFinite(body.r) && body.r > 0 ? body.r : 0;
  const f = Number.isFinite(body.shape?.oblateness)
    ? Math.max(0, Math.min(0.95, body.shape!.oblateness as number))
    : 0;
  const oblateEquiv = rBody * (1 - 0.5 * f);
  const ringOuter = Number.isFinite(body.rings?.outerRadius)
    ? Math.max(0, body.rings!.outerRadius as number)
    : 0;
  return Math.max(oblateEquiv, ringOuter, rBody);
}

export type AdditiveFluxComponents = {
  fluxPlanetOnly: number;
  fluxMoonOnly: number;
  fluxStellarVarOnly: number;
  fluxForwardScatteringOnly: number;
  fluxRingScatteringOnly: number;
  planetVisibleFraction?: number;
  moonVisibleFraction?: number;
};

function normalizedBandWeights(
  phot: SystemParams["star"]["photometry"],
): Array<{ lambdaNm: number; w: number }> {
  const bp = phot?.spectralBandpass;
  if (!bp?.enabled || !Array.isArray(bp.lambdaNm) || bp.lambdaNm.length === 0) {
    return [{ lambdaNm: 550, w: 1 }];
  }
  const lambda = bp.lambdaNm.filter((x) => Number.isFinite(x) && x > 0);
  if (lambda.length === 0) return [{ lambdaNm: 550, w: 1 }];
  const raw =
    Array.isArray(bp.weights) && bp.weights.length === lambda.length ? bp.weights : lambda.map(() => 1);
  const clipped = raw.map((x) => (Number.isFinite(x) && x > 0 ? x : 0));
  const sum = clipped.reduce((a, b) => a + b, 0);
  const norm = sum > 0 ? clipped.map((x) => x / sum) : lambda.map(() => 1 / lambda.length);
  return lambda.map((lambdaNm, i) => ({ lambdaNm, w: norm[i] }));
}

function bandScatteringBoost(lambdaNm: number, rt: AtmosphereRTParams | undefined): number {
  if (!rt?.scattering?.enabled) return 1;
  const gain = Number.isFinite(rt.scattering.gain) ? Math.max(0, rt.scattering.gain as number) : 0;
  const g = Number.isFinite(rt.scattering.g) ? Math.max(-0.95, Math.min(0.95, rt.scattering.g as number)) : 0;
  const lambdaRef = Number.isFinite(rt.lambdaRefNm) ? Math.max(1, rt.lambdaRefNm as number) : 550;
  const wl = Number.isFinite(lambdaNm) ? Math.max(1, lambdaNm) : lambdaRef;
  const wlScale = Math.pow(wl / lambdaRef, -(0.3 + 0.4 * Math.max(0, g)));
  return 1 + gain * wlScale;
}

function gaussianPhaseWeight(phase: number, sigma: number): number {
  const d = Math.atan2(Math.sin(phase), Math.cos(phase));
  const s = Math.max(1e-6, sigma);
  return Math.exp(-(d * d) / (2 * s * s));
}

function hasActiveThermalPhaseChannel(args: {
  model: PhaseCurveParams | undefined;
  thermalModelAdvanced: ThermalModelAdvancedParams | undefined;
  system: SystemParams;
}): boolean {
  if (!args.model?.enabled) return false;
  if (Number.isFinite(args.model.thermAmp) && (args.model.thermAmp as number) > 0) return true;
  if (Number.isFinite(args.model.constant) && (args.model.constant as number) > 0) return true;
  if (isPhysicsFeatureEnabled(args.system, "thermalEnergyBalance") && args.thermalModelAdvanced?.enabled) {
    return true;
  }
  return false;
}

function hasActiveReflectedPhaseChannel(model: PhaseCurveParams | undefined): boolean {
  if (!model?.enabled) return false;
  return Number.isFinite(model.reflAmp) && (model.reflAmp as number) > 0;
}

export function computeAdditiveFluxComponents(
  params: SystemParams,
  t: number,
  observerDir: Vec3,
  kin: BodyKinematics,
): AdditiveFluxComponents {
  const phot = params.star.photometry;
  const starRadius = params.star.r;
  const bands = normalizedBandWeights(phot);

  const orbit = kin.planetOrbit ?? resolveOrbitElements(params.planet.orbit, t, "planet.orbit");
  const thermalModelAdvanced = isPhysicsFeatureEnabled(params, "thermalEnergyBalance")
    ? phot?.thermalModelAdvanced
    : undefined;
  const scientificEnergyComposition =
    params.dynamics?.fidelityProfile === "accurate" || params.dynamics?.fidelityProfile === "reference";

  // Phase / self-reflected light terms (additive).
  // Planet phase is always computed (uses planet orbit period for thermal inertia / phase).
  let fluxPlanetOnly = 0;
  for (const b of bands) {
    const base = bodyPhaseFlux({
      rBody: kin.rPlanetAbs,
      rBodyRadius: params.planet.r,
      rStarRadius: starRadius,
      observerDir,
      orbitPeriodSec: orbit.period,
      model: phot?.phaseCurve,
      dayNightVisibility: phot?.dayNightVisibility,
      thermalModelAdvanced,
    });
    fluxPlanetOnly += b.w * base * bandScatteringBoost(b.lambdaNm, phot?.atmosphereRT);
  }

  // Moon phase is optional. Use the moon's orbit period (around planet), not the planet's, for correct thermal/phase timescale.
  let fluxMoonOnly = 0;
  if (params.moon && kin.rMoonAbs) {
    const moonOrbitEl = resolveOrbitElements(params.moon.orbitAroundPlanet, t, "moon.orbitAroundPlanet");
    for (const b of bands) {
      const base = bodyPhaseFlux({
        rBody: kin.rMoonAbs,
        rBodyRadius: params.moon.r,
        rStarRadius: starRadius,
        observerDir,
        orbitPeriodSec: moonOrbitEl.period,
        model: phot?.moonPhaseCurve,
        dayNightVisibility: phot?.dayNightVisibility,
        thermalModelAdvanced,
      });
      fluxMoonOnly += b.w * base * bandScatteringBoost(b.lambdaNm, phot?.atmosphereRT);
    }
  }

  const rt = isPhysicsFeatureEnabled(params, "atmosphereRT") ? phot?.atmosphereRT : undefined;
  if (rt?.enabled && rt.emission?.enabled) {
    const amp = Number.isFinite(rt.emission.amp) ? Math.max(0, rt.emission.amp as number) : 0;
    const lag = Number.isFinite(rt.emission.phaseLag) ? (rt.emission.phaseLag as number) : 0;
    if (amp > 0) {
      const applyEmission = (rBody: Vec3): number => {
        const alpha = phaseAngleRadFromBodyPos(rBody, observerDir);
        if (!Number.isFinite(alpha)) return 0;
        const w = Math.max(0, 0.5 * (1 + Math.cos(alpha - lag)));
        return amp * w;
      };
      if (
        (rt.target ?? "planet") === "planet" &&
        !(
          scientificEnergyComposition &&
          hasActiveThermalPhaseChannel({
            model: phot?.phaseCurve,
            thermalModelAdvanced,
            system: params,
          })
        )
      ) {
        fluxPlanetOnly += applyEmission(kin.rPlanetAbs);
      } else if (
        params.moon &&
        kin.rMoonAbs &&
        !(
          scientificEnergyComposition &&
          hasActiveThermalPhaseChannel({
            model: phot?.moonPhaseCurve,
            thermalModelAdvanced,
            system: params,
          })
        )
      ) {
        fluxMoonOnly += applyEmission(kin.rMoonAbs);
      }
    }
  }

  // Mutual events: compute visible fractions for diagnostics.
  // Limitation: Mutual events assume uniform disks for the bodies, ignoring phase geometry overlap (crescent-on-crescent effects).
  //
  // NOTE (intentional divergence): The diagnostic visible fractions below use a
  // simple pairwise circle-occultation model (visibleFractionWhenOcculted) so
  // they are cheap to compute and easy to interpret.  The flux-affecting
  // fractions computed further down use visibleFractionWithOcculters, which
  // handles the union of all occulters simultaneously (star + mutual body).
  // The two models can disagree when multiple occulters overlap.  This is
  // intentional: diagnostics show the mutual-event geometry in isolation,
  // while flux uses the physically accurate combined occlusion.
  let planetVisibleFraction: number | undefined;
  let moonVisibleFraction: number | undefined;

  if (params.moon && kin.moonSky) {
    // Moon in front of planet => diagnostic visible fraction.
    if (fluxPlanetOnly !== 0 && kin.moonSky.z > kin.planetSky.z) {
      const visPlanet = visibleFractionWhenOcculted({
        targetSky: kin.planetSky,
        occulterSky: kin.moonSky,
        rTarget: params.planet.r,
        rOcculter: params.moon.r,
      });
      if (Number.isFinite(visPlanet)) {
        planetVisibleFraction = visPlanet;
      }
    }

    // Planet in front of moon => diagnostic visible fraction.
    if (fluxMoonOnly !== 0 && kin.planetSky.z > kin.moonSky.z) {
      const visMoon = visibleFractionWhenOcculted({
        targetSky: kin.moonSky,
        occulterSky: kin.planetSky,
        rTarget: params.moon.r,
        rOcculter: params.planet.r,
      });
      if (Number.isFinite(visMoon)) {
        moonVisibleFraction = visMoon;
      }
    }
  }

  // Secondary eclipse + mutual events combined: use union-of-occulters for accurate visible fraction.
  // (Toy model: uniform-brightness disk for the body.)
  const STAR_SKY = { x: 0, y: 0, z: 0 };

  if (fluxPlanetOnly !== 0) {
    const planetOcculters: CircleOcculter[] = [];
    addOcculterIfFront(planetOcculters, kin.planetSky, STAR_SKY, starRadius);
    if (params.moon && kin.moonSky) {
      const moonOccR = isPhysicsFeatureEnabled(params, "nonSphericalFlux")
        ? effectiveProjectedRadius(params.moon)
        : params.moon.r;
      addOcculterIfFront(planetOcculters, kin.planetSky, kin.moonSky, moonOccR);
    }
    const planetTargetR = isPhysicsFeatureEnabled(params, "nonSphericalFlux")
      ? effectiveProjectedRadius(params.planet)
      : params.planet.r;
    const planetVis = visibleFractionWithOcculters(planetTargetR, planetOcculters);
    if (Number.isFinite(planetVis)) fluxPlanetOnly *= planetVis;
  }

  if (fluxMoonOnly !== 0 && params.moon && kin.moonSky) {
    const moonOcculters: CircleOcculter[] = [];
    addOcculterIfFront(moonOcculters, kin.moonSky, STAR_SKY, starRadius);
    const planetOccR = isPhysicsFeatureEnabled(params, "nonSphericalFlux")
      ? effectiveProjectedRadius(params.planet)
      : params.planet.r;
    addOcculterIfFront(moonOcculters, kin.moonSky, kin.planetSky, planetOccR);
    const moonTargetR = isPhysicsFeatureEnabled(params, "nonSphericalFlux")
      ? effectiveProjectedRadius(params.moon)
      : params.moon.r;
    const moonVis = visibleFractionWithOcculters(moonTargetR, moonOcculters);
    if (Number.isFinite(moonVis)) fluxMoonOnly *= moonVis;
  }

  // Stellar variability is an emitted stellar term (added to baseline) that will be multiplied by F_transit upstream.
  const fluxStellarVarOnly = stellarVariabilityFlux({
    t,
    orbit,
    model: phot?.stellarVariability,
  });

  // Forward scattering (additive). Modeled only for the planet in this UI schema.
  const phase = orbitalPhaseFromPeriod({
    t,
    period: orbit.period,
    t0: orbit.t0,
  });
  const fluxForwardScatteringOnly = computeForwardScatteringFlux({
    rBody: kin.rPlanetAbs,
    observerDir,
    model:
      scientificEnergyComposition && hasActiveReflectedPhaseChannel(phot?.phaseCurve)
        ? { ...phot?.forwardScattering, enabled: false }
        : phot?.forwardScattering,
    phase: Number.isFinite(phase) ? phase : undefined,
  });

  let fluxRingScatteringOnly = 0;
  const ringSc = isPhysicsFeatureEnabled(params, "nonSphericalFlux") ? phot?.ringScattering : undefined;
  if (
    ringSc?.enabled &&
    params.planet?.rings &&
    Number.isFinite(ringSc.amp) &&
    !(scientificEnergyComposition && hasActiveReflectedPhaseChannel(phot?.phaseCurve))
  ) {
    const amp = Math.max(0, ringSc.amp as number);
    if (amp > 0) {
      const sigma = Number.isFinite(ringSc.sigmaPhase) ? Math.max(1e-4, ringSc.sigmaPhase as number) : 0.25;
      const phaseW = Number.isFinite(phase) ? gaussianPhaseWeight(phase, sigma) : 0;
      const inc = Number.isFinite(params.planet.rings.inclination)
        ? (params.planet.rings.inclination as number)
        : 0;
      const tilt = clamp(Math.abs(Math.cos(inc)), 0.1, 1);
      fluxRingScatteringOnly = amp * phaseW * tilt;
    }
  }

  // Robustness: enforce finite outputs (fail-open to 0 for additive components).
  return {
    fluxPlanetOnly: toFiniteNumber(fluxPlanetOnly, 0),
    fluxMoonOnly: toFiniteNumber(fluxMoonOnly, 0),
    fluxStellarVarOnly: toFiniteNumber(fluxStellarVarOnly, 0),
    fluxForwardScatteringOnly: toFiniteNumber(fluxForwardScatteringOnly, 0),
    fluxRingScatteringOnly: toFiniteNumber(fluxRingScatteringOnly, 0),
    planetVisibleFraction,
    moonVisibleFraction,
  };
}
