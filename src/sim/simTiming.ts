/** Computes clock, transit, observable, relativity, and close-encounter timing diagnostics. */
import type {
  StepAdvancedTimingDiagnostics,
  StepResult,
  StepTimingDiagnostics,
  SystemParams,
} from "../core/types";
import { G_SI } from "../core/units";
import { muFromPeriodAndA } from "../physics/kepler";
import {
  einsteinDelaySurrogateSec,
  lightBendingAngleRad,
  normalizeRelativityParams,
} from "../physics/relativity";
import type { Vec3 } from "../physics/vec3";
import { computeExoDiagnostics } from "./diagnostics";
import { getNBodyStateAt, isNBodyEnabled } from "./dynamics";
import { resolvePlanetOrbitForKinematics } from "./kinematics";
import { computeStepObservables } from "./observables";
import { resolveDynamicSystemState } from "./systemState";
import { computeTransitTimingDiagnostics } from "./transitTiming";
import type {
  BodyKinematicsState,
  ObserverDir,
  StepGeometry,
  StepObservablesResult,
  StepTimingBundle,
  TransitTimingResult,
} from "./simTypes";

type DynamicSystemState = ReturnType<typeof resolveDynamicSystemState>;
type RelativityConfig = ReturnType<typeof normalizeRelativityParams>;
type NBodySample = NonNullable<ReturnType<typeof getNBodyStateAt>>;

type AdvancedTimingContext = {
  params: SystemParams;
  tObsSec: number;
  observerDir: ObserverDir;
  clockOffsetSec: number;
  rel: RelativityConfig;
  mu: number | undefined;
  dynamic: DynamicSystemState;
  closeEncounterDistance: number | undefined;
};

export function mapTimingSolveDiagnostics(
  timingSolve: BodyKinematicsState["timingSolve"],
): NonNullable<StepResult["meta"]>["timingConvergence"] {
  if (!timingSolve) return undefined;
  return {
    planet: timingSolve.planet && {
      status: timingSolve.planet.status,
      converged: timingSolve.planet.converged,
      iterations: timingSolve.planet.iterations,
      maxIters: timingSolve.planet.maxIters,
      tolSec: timingSolve.planet.tolSec,
      usedShapiro: timingSolve.planet.usedShapiro,
      usedMultiBodyShapiro: timingSolve.planet.usedMultiBodyShapiro,
      validityFlags: [...timingSolve.planet.validityFlags],
      roemerSec: timingSolve.planet.roemerSec,
      shapiroSec: timingSolve.planet.shapiroSec,
      delaySec: timingSolve.planet.delaySec,
      residualSec: timingSolve.planet.residualSec,
    },
    moon: timingSolve.moon && {
      status: timingSolve.moon.status,
      converged: timingSolve.moon.converged,
      iterations: timingSolve.moon.iterations,
      maxIters: timingSolve.moon.maxIters,
      tolSec: timingSolve.moon.tolSec,
      usedShapiro: timingSolve.moon.usedShapiro,
      usedMultiBodyShapiro: timingSolve.moon.usedMultiBodyShapiro,
      validityFlags: [...timingSolve.moon.validityFlags],
      roemerSec: timingSolve.moon.roemerSec,
      shapiroSec: timingSolve.moon.shapiroSec,
      delaySec: timingSolve.moon.delaySec,
      residualSec: timingSolve.moon.residualSec,
    },
  };
}

function resolveObserverClockOffsetSec(params: SystemParams, tObsSec: number): number {
  const timekeeping = params.observer?.timekeeping;
  if (!timekeeping?.enabled) return 0;
  const constant = finiteConfigNumber(timekeeping.barycentricOffsetSec, 0);
  const amp = finiteConfigNumber(timekeeping.periodicErrorAmpSec, 0);
  const periodSec = finiteConfigNumber(timekeeping.periodSec, Number.NaN);
  let periodic = 0;
  if (Number.isFinite(amp) && amp !== 0 && Number.isFinite(periodSec) && periodSec > 0) {
    const phaseSec = finiteConfigNumber(timekeeping.phaseSec, 0);
    periodic = amp * Math.sin((2 * Math.PI * (tObsSec - phaseSec)) / periodSec);
  }
  const offset = constant + periodic;
  return Number.isFinite(offset) ? offset : 0;
}

function finiteConfigNumber(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) ? (value as number) : fallback;
}

function applyClockOffsetToTiming(
  timing: StepTimingDiagnostics | undefined,
  offsetSec: number,
): StepTimingDiagnostics | undefined {
  if (!timing || !Number.isFinite(offsetSec) || offsetSec === 0) return timing;
  const shift = (value: number | undefined): number | undefined =>
    Number.isFinite(value) ? (value as number) + offsetSec : value;
  return {
    ...timing,
    barycentricClockOffsetSec: offsetSec,
    planetTransitCenterSec: shift(timing.planetTransitCenterSec),
    planetIngressSec: shift(timing.planetIngressSec),
    planetEgressSec: shift(timing.planetEgressSec),
    planetTtvSec: timing.planetTtvSec,
    moonTransitCenterSec: shift(timing.moonTransitCenterSec),
    moonIngressSec: shift(timing.moonIngressSec),
    moonEgressSec: shift(timing.moonEgressSec),
    moonTtvSec: timing.moonTtvSec,
  };
}

function deriveCentralMu(params: SystemParams, tObsSec: number): number | undefined {
  if (Number.isFinite(params.star.m) && (params.star.m as number) > 0) {
    return G_SI * (params.star.m as number);
  }
  try {
    const orbit = resolvePlanetOrbitForKinematics(params, tObsSec, "planet.orbit");
    const mu = muFromPeriodAndA(orbit.period, orbit.a);
    return Number.isFinite(mu) && mu > 0 ? mu : undefined;
  } catch {
    return undefined;
  }
}

function currentCloseEncounterDistance(params: SystemParams, tObsSec: number): number | undefined {
  if (!isNBodyEnabled(params)) return undefined;
  const sample = getNBodyStateAt(params, tObsSec);
  if (!sample) return undefined;
  return minimumFiniteDistance(
    closestFinitePairDistance(closeEncounterBodies(sample)),
    sample.state.minimumEncounterDistance,
  );
}

function minimumFiniteDistance(left: number | undefined, right: number | undefined): number | undefined {
  const values = [left, right].filter((value): value is number => Number.isFinite(value));
  return values.length > 0 ? Math.min(...values) : undefined;
}

function closeEncounterBodies(sample: NBodySample): Vec3[] {
  return [
    sample.state.rS,
    sample.state.rP,
    sample.state.rM,
    ...(sample.state.perturbers?.map((perturber) => perturber.r) ?? []),
  ];
}

function closestFinitePairDistance(bodies: Vec3[]): number | undefined {
  let best = Number.POSITIVE_INFINITY;
  for (let left = 0; left < bodies.length; left++) {
    for (let right = left + 1; right < bodies.length; right++) {
      const a = bodies[left];
      const b = bodies[right];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dz = b.z - a.z;
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (Number.isFinite(distance) && distance < best) best = distance;
    }
  }
  return Number.isFinite(best) ? best : undefined;
}

function computeAdvancedTimingDiagnostics(
  params: SystemParams,
  tObsSec: number,
  observerDir: ObserverDir,
  kin: BodyKinematicsState,
  clockOffsetSec: number,
): StepAdvancedTimingDiagnostics | undefined {
  const rel = normalizeRelativityParams(params.dynamics?.relativity);
  const context: AdvancedTimingContext = {
    params,
    tObsSec,
    observerDir,
    clockOffsetSec,
    rel,
    mu: deriveCentralMu(params, tObsSec),
    dynamic: resolveDynamicSystemState({ system: params, tObs: tObsSec, observerDir, kinAtT: kin }),
    closeEncounterDistance: currentCloseEncounterDistance(params, tObsSec),
  };
  const out: StepAdvancedTimingDiagnostics = {
    einsteinPlanetSec: einsteinDelayForBody(context, context.dynamic.planet),
    einsteinMoonSec: einsteinDelayForBody(context, context.dynamic.moon),
    barycentricClockOffsetSec:
      Number.isFinite(clockOffsetSec) && clockOffsetSec !== 0 ? clockOffsetSec : undefined,
    lightBendingPlanetRad: lightBendingForBody(context, context.dynamic.planet),
    lightBendingMoonRad: lightBendingForBody(context, context.dynamic.moon),
    closeEncounterDistance: finiteNumberOrUndefined(context.closeEncounterDistance),
    validityFlags: advancedValidityFlags(context),
  };
  return Object.values(out).some((value) =>
    Array.isArray(value) ? value.length > 0 : typeof value === "number",
  )
    ? out
    : undefined;
}

function einsteinDelayForBody(
  context: AdvancedTimingContext,
  body: DynamicSystemState["planet"] | undefined,
): number | undefined {
  if (!context.rel.einsteinDelay || !context.mu || !body) return undefined;
  return finiteNumberOrUndefined(
    einsteinDelaySurrogateSec({
      r: body.r,
      v: body.v,
      mu: context.mu,
      c: context.rel.c,
      tObs: context.tObsSec,
      tRef: context.rel.timingRefSec,
    }),
  );
}

function lightBendingForBody(
  context: AdvancedTimingContext,
  body: DynamicSystemState["planet"] | undefined,
): number | undefined {
  if (!context.rel.lightBending || !context.mu || !body) return undefined;
  return finiteNumberOrUndefined(
    lightBendingAngleRad({
      r: body.r,
      observerDir: context.observerDir,
      mu: context.mu,
      c: context.rel.c,
      minImpact: context.rel.shapiroMinImpact,
    }),
  );
}

function advancedValidityFlags(context: AdvancedTimingContext): string[] {
  const flags: string[] = [];
  const add = (flag: string, enabled: boolean): void => {
    if (enabled && flags.indexOf(flag) === -1) flags.push(flag);
  };
  add("surrogate-model", context.rel.einsteinDelay || context.rel.lightBending);
  add("clock-frame-mismatch", Number.isFinite(context.clockOffsetSec) && context.clockOffsetSec !== 0);
  const minSeparation = context.params.dynamics?.collisionPolicy?.minSeparation;
  add(
    "close-encounter",
    Number.isFinite(context.closeEncounterDistance) &&
      Number.isFinite(minSeparation) &&
      (context.closeEncounterDistance as number) < (minSeparation as number),
  );
  return flags;
}

function finiteNumberOrUndefined(value: number | undefined): number | undefined {
  return Number.isFinite(value) ? (value as number) : undefined;
}

function resolvedStepTiming(
  observablesRaw: StepObservablesResult,
  dynamicTiming: TransitTimingResult,
  advancedTiming: StepAdvancedTimingDiagnostics | undefined,
  clockOffsetSec: number,
): StepTimingDiagnostics | undefined {
  const advancedFields: Partial<StepTimingDiagnostics> = {};
  if (advancedTiming?.einsteinPlanetSec !== undefined) {
    advancedFields.einsteinPlanetSec = advancedTiming.einsteinPlanetSec;
  }
  if (advancedTiming?.einsteinMoonSec !== undefined) {
    advancedFields.einsteinMoonSec = advancedTiming.einsteinMoonSec;
  }
  if (advancedTiming?.barycentricClockOffsetSec !== undefined) {
    advancedFields.barycentricClockOffsetSec = advancedTiming.barycentricClockOffsetSec;
  }
  const merged: StepTimingDiagnostics = {
    ...(observablesRaw?.timing ?? {}),
    ...(dynamicTiming.timing ?? {}),
    ...advancedFields,
  };
  const withClock = applyClockOffsetToTiming(merged, clockOffsetSec);
  return Object.values(withClock ?? {}).some((value) => typeof value === "number" && Number.isFinite(value))
    ? withClock
    : undefined;
}

export function computeStepTimingBundle(
  params: SystemParams,
  t: number,
  geometry: StepGeometry,
): StepTimingBundle {
  const exoDiag = computeExoDiagnostics(params, t, geometry.observerDir, geometry.kin);
  const observablesRaw = computeStepObservables(params, t, geometry.observerDir, geometry.kin);
  const dynamicTiming = computeTransitTimingDiagnostics(params, t, geometry.observerDir, geometry.kin);
  const clockOffsetSec = resolveObserverClockOffsetSec(params, t);
  const advancedTiming = computeAdvancedTimingDiagnostics(
    params,
    t,
    geometry.observerDir,
    geometry.kin,
    clockOffsetSec,
  );
  const timing = resolvedStepTiming(observablesRaw, dynamicTiming, advancedTiming, clockOffsetSec);
  const observables = observablesRaw ? { ...observablesRaw, timing } : undefined;
  return {
    exoDiag,
    dynamicTiming,
    advancedTiming,
    observables,
    timing,
    conservation: observablesRaw?.conservation,
  };
}
