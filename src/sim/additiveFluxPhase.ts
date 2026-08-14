/** Computes reflected, thermal, and atmospheric-emission phase flux. */
import type { PhaseCurveParams } from "../core/types";
import { phaseAngleRadFromBodyPos } from "../photometry/dayNightVisibility";
import { bodyPhaseFlux } from "../photometry/phaseCurve";
import type { Vec3 } from "../physics/vec3";
import { bandScatteringBoost, hasActiveThermalPhaseChannel } from "./additiveFluxContext";
import type { AdditiveFluxContext, FluxPair } from "./additiveFluxTypes";
import { resolveOrbitElements } from "./orbits";

export function computePhaseFluxTerms(context: AdditiveFluxContext): FluxPair {
  return {
    fluxPlanetOnly: weightedBodyPhaseFlux(context, {
      rBody: context.kin.rPlanetAbs,
      rBodyRadius: context.params.planet.r,
      orbitPeriodSec: context.orbit.period,
      model: context.phot?.phaseCurve,
    }),
    fluxMoonOnly: computeMoonPhaseFlux(context),
  };
}

function computeMoonPhaseFlux(context: AdditiveFluxContext): number {
  const { params, t, kin } = context;
  if (!params.moon || !kin.rMoonAbs) return 0;
  const moonOrbitEl = resolveOrbitElements(params.moon.orbitAroundPlanet, t, "moon.orbitAroundPlanet");
  return weightedBodyPhaseFlux(context, {
    rBody: kin.rMoonAbs,
    rBodyRadius: params.moon.r,
    orbitPeriodSec: moonOrbitEl.period,
    model: context.phot?.moonPhaseCurve,
  });
}

function weightedBodyPhaseFlux(
  context: AdditiveFluxContext,
  body: {
    rBody: Vec3;
    rBodyRadius: number;
    orbitPeriodSec: number;
    model: PhaseCurveParams | undefined;
  },
): number {
  let flux = 0;
  for (const band of context.bands) {
    const base = bodyPhaseFlux({
      rBody: body.rBody,
      rBodyRadius: body.rBodyRadius,
      rStarRadius: context.starRadius,
      observerDir: context.observerDir,
      orbitPeriodSec: body.orbitPeriodSec,
      model: body.model,
      dayNightVisibility: context.phot?.dayNightVisibility,
      thermalModelAdvanced: context.thermalModelAdvanced,
      reflectedFluxScale: bandScatteringBoost(band.lambdaNm, context),
    });
    flux += band.w * base;
  }
  return flux;
}

export function applyRtEmissionTerms(context: AdditiveFluxContext, flux: FluxPair): FluxPair {
  const rt = context.rt;
  const emission = rt?.emission;
  if (!rt?.enabled || !emission?.enabled) return flux;
  const amp = Number.isFinite(emission.amp) ? Math.max(0, emission.amp as number) : 0;
  if (amp <= 0) return flux;
  const lag = Number.isFinite(emission.phaseLag) ? (emission.phaseLag as number) : 0;
  if ((rt.target ?? "planet") === "moon") return applyMoonEmission(context, flux, amp, lag);
  return applyPlanetEmission(context, flux, amp, lag);
}

function applyPlanetEmission(
  context: AdditiveFluxContext,
  flux: FluxPair,
  amp: number,
  lag: number,
): FluxPair {
  if (suppressesThermalEmission(context, context.phot?.phaseCurve)) return flux;
  return {
    ...flux,
    fluxPlanetOnly: flux.fluxPlanetOnly + emissionFlux(context.kin.rPlanetAbs, context.observerDir, amp, lag),
  };
}

function applyMoonEmission(context: AdditiveFluxContext, flux: FluxPair, amp: number, lag: number): FluxPair {
  if (!context.params.moon || !context.kin.rMoonAbs) return flux;
  if (suppressesThermalEmission(context, context.phot?.moonPhaseCurve)) return flux;
  return {
    ...flux,
    fluxMoonOnly: flux.fluxMoonOnly + emissionFlux(context.kin.rMoonAbs, context.observerDir, amp, lag),
  };
}

function suppressesThermalEmission(
  context: AdditiveFluxContext,
  model: PhaseCurveParams | undefined,
): boolean {
  return (
    context.scientificEnergyComposition &&
    hasActiveThermalPhaseChannel({
      model,
      thermalModelAdvanced: context.thermalModelAdvanced,
      system: context.params,
    })
  );
}

function emissionFlux(rBody: Vec3, observerDir: Vec3, amp: number, lag: number): number {
  const alpha = phaseAngleRadFromBodyPos(rBody, observerDir);
  if (!Number.isFinite(alpha)) return 0;
  return amp * Math.max(0, 0.5 * (1 + Math.cos(alpha - lag)));
}
