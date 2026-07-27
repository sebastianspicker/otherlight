/**
 * Converts the supported Education state subset into strict barycentric SI V5
 * requests and rejects dynamics that cannot be represented without approximation.
 */
import type { OrbitElements, SystemParams } from "../core/types";
import { G_SI } from "../core/units";
import type { Vec3 } from "../physics/vec3";
import { stateFromResolvedElements } from "../sim/orbits";
import {
  DEFAULT_EPOCH_JD_TDB,
  SCIENCE_SCHEMA_VERSION,
  type ForwardRunRequest,
  type ScientificBodyKind,
  type ScientificBodyV5,
  type ScientificScenarioV5,
  type Vector3,
} from "./types";
import { ScienceValidationError, assertForwardRunRequest, assertScientificScenarioV5 } from "./validation";

const KEPLER_PERIOD_RELATIVE_TOLERANCE = 1e-4;
const DEFAULT_POSITION_TOLERANCE_M = 1e-3;
const DEFAULT_VELOCITY_TOLERANCE_MPS = 1e-6;
const DEFAULT_RELATIVE_TOLERANCE = 1e-11;
const DEFAULT_MAX_STEP_SEC = 3_600;

export type BuildScientificScenarioV5Input = {
  system: SystemParams;
  binaryMode: boolean;
  id?: string;
  epochJdTdb?: number;
  targetBodyId?: string;
};

export type BuildScientificForwardRequestInput = BuildScientificScenarioV5Input & {
  startOffsetSec: number;
  endOffsetSec: number;
  sampleCadenceSec: number;
  seed: number;
};

type RelativeState = { r: Vec3; v: Vec3 };
type BodyInput = { id: string; kind: ScientificBodyKind; massKg: number; radiusM: number };

const adapterError = (message: string): never => {
  throw new ScienceValidationError(`Cannot build a V5 scientific scenario: ${message}`);
};

function positive(value: number | undefined, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    adapterError(`${path} must be a finite positive SI value.`);
  }
  return value as number;
}

function staticOrbit(
  value: SystemParams["planet"]["orbit"] | NonNullable<SystemParams["moon"]>["orbitAroundPlanet"],
  path: string,
): OrbitElements {
  if (typeof value === "function")
    adapterError(`${path} providers are unsupported; provide static elements.`);
  return value as OrbitElements;
}

function checkedKeplerPeriod(orbit: OrbitElements, totalMassKg: number, path: string): number {
  const semiMajorAxisM = positive(orbit.a, `${path}.a`);
  const suppliedPeriodSec = positive(orbit.period, `${path}.period`);
  const expectedPeriodSec = 2 * Math.PI * Math.sqrt(semiMajorAxisM ** 3 / (G_SI * totalMassKg));
  const relativeError = Math.abs(suppliedPeriodSec - expectedPeriodSec) / expectedPeriodSec;
  if (!Number.isFinite(relativeError) || relativeError > KEPLER_PERIOD_RELATIVE_TOLERANCE) {
    adapterError(
      `${path}.period is inconsistent with a, G, and the two-body masses ` +
        `(relative error ${relativeError}; limit ${KEPLER_PERIOD_RELATIVE_TOLERANCE}).`,
    );
  }
  return expectedPeriodSec;
}

function resolvedState(orbit: OrbitElements, totalMassKg: number, path: string): RelativeState {
  const massConsistentPeriod = checkedKeplerPeriod(orbit, totalMassKg, path);
  try {
    return stateFromResolvedElements(
      { ...orbit, period: massConsistentPeriod },
      0,
      G_SI * totalMassKg,
      path,
      { strict: true },
    );
  } catch (error) {
    return adapterError(`${path} is invalid (${error instanceof Error ? error.message : String(error)}).`);
  }
}

const scaled = (vector: Vec3, factor: number): Vec3 => ({
  x: vector.x * factor,
  y: vector.y * factor,
  z: vector.z * factor,
});

const added = (left: Vec3, right: Vec3): Vec3 => ({
  x: left.x + right.x,
  y: left.y + right.y,
  z: left.z + right.z,
});

const vector3 = (vector: Vec3): Vector3 => [vector.x, vector.y, vector.z];

function scientificBody(input: BodyInput, position: Vec3, velocity: Vec3): ScientificBodyV5 {
  return {
    id: input.id,
    kind: input.kind,
    massKg: input.massKg,
    radiusM: input.radiusM,
    state: { positionM: vector3(position), velocityMps: vector3(velocity) },
  };
}

function splitRelativePair(
  primary: BodyInput,
  secondary: BodyInput,
  relative: RelativeState,
  centre: RelativeState = { r: { x: 0, y: 0, z: 0 }, v: { x: 0, y: 0, z: 0 } },
): [ScientificBodyV5, ScientificBodyV5] {
  const totalMass = primary.massKg + secondary.massKg;
  const secondaryFraction = secondary.massKg / totalMass;
  const primaryFraction = primary.massKg / totalMass;
  return [
    scientificBody(
      primary,
      added(centre.r, scaled(relative.r, -secondaryFraction)),
      added(centre.v, scaled(relative.v, -secondaryFraction)),
    ),
    scientificBody(
      secondary,
      added(centre.r, scaled(relative.r, primaryFraction)),
      added(centre.v, scaled(relative.v, primaryFraction)),
    ),
  ];
}

function assertSupportedDynamics(system: SystemParams): void {
  const dynamics = system.dynamics;
  if (dynamics?.nbodyPlanetMoon?.enabled)
    adapterError("an already-active browser N-body state is unsupported.");
  if (dynamics?.nbodyPlanetMoon?.perturbers?.some((body) => body.enabled !== false)) {
    adapterError("additional N-body perturbers are unsupported.");
  }
  if (dynamics?.relativity?.enabled) adapterError("relativistic browser dynamics are unsupported.");
  if (dynamics?.secular?.enabled) adapterError("secular browser dynamics are unsupported.");
  const timing = dynamics?.exomoonTimingShape;
  const activeTimingEvolution = [
    timing?.moonOmegaDot,
    timing?.moonIncDot,
    timing?.moonOmegaSmallDot,
    timing?.moonImpactYDot,
  ].some((value) => typeof value === "number" && value !== 0);
  if (
    timing?.enabled &&
    (activeTimingEvolution ||
      timing.moonOmega0 !== undefined ||
      timing.moonInc0 !== undefined ||
      timing.moonOmegaSmall0 !== undefined)
  ) {
    adapterError("time-dependent exomoon orientation or sky-plane drift is unsupported.");
  }
  for (const [path, body] of [
    ["star", system.star],
    ["planet", system.planet],
    ["moon", system.moon],
  ] as const) {
    if (body?.tides?.enabled) adapterError(`${path}.tides is unsupported.`);
    const j2 = body?.gravityHarmonics?.J2;
    if (j2 !== undefined && (!Number.isFinite(j2) || j2 !== 0)) {
      adapterError(`${path}.gravityHarmonics.J2 is unsupported.`);
    }
  }
}

function observerLineOfSight(system: SystemParams): Vector3 {
  const direction = system.observer?.dir ?? { x: 0, y: 0, z: 1 };
  const magnitude = Math.hypot(direction.x, direction.y, direction.z);
  if (!Number.isFinite(magnitude) || magnitude === 0)
    adapterError("observer.dir must be a finite non-zero vector.");
  return [direction.x / magnitude, direction.y / magnitude, direction.z / magnitude];
}

function detachedBinaryBodies(system: SystemParams): { bodies: ScientificBodyV5[]; periods: number[] } {
  if (system.moon) adapterError("binaryMode does not accept a moon; use the general star/planet/moon mode.");
  const primary: BodyInput = {
    id: "star",
    kind: "star",
    massKg: positive(system.star.m, "star.m"),
    radiusM: positive(system.star.r, "star.r"),
  };
  const companion: BodyInput = {
    id: "companion",
    kind: "companion",
    massKg: positive(system.planet.m, "planet.m"),
    radiusM: positive(system.planet.r, "planet.r"),
  };
  const orbit = staticOrbit(system.planet.orbit, "planet.orbit");
  const relative = resolvedState(orbit, primary.massKg + companion.massKg, "planet.orbit");
  return { bodies: splitRelativePair(primary, companion, relative), periods: [orbit.period] };
}

function generalSystemBodies(system: SystemParams): { bodies: ScientificBodyV5[]; periods: number[] } {
  const star: BodyInput = {
    id: "star",
    kind: "star",
    massKg: positive(system.star.m, "star.m"),
    radiusM: positive(system.star.r, "star.r"),
  };
  const planet: BodyInput = {
    id: "planet",
    kind: "planet",
    massKg: positive(system.planet.m, "planet.m"),
    radiusM: positive(system.planet.r, "planet.r"),
  };
  const outerOrbit = staticOrbit(system.planet.orbit, "planet.orbit");
  if (!system.moon) {
    const relative = resolvedState(outerOrbit, star.massKg + planet.massKg, "planet.orbit");
    return { bodies: splitRelativePair(star, planet, relative), periods: [outerOrbit.period] };
  }

  const moon: BodyInput = {
    id: "moon",
    kind: "moon",
    massKg: positive(system.moon.m, "moon.m"),
    radiusM: positive(system.moon.r, "moon.r"),
  };
  const innerOrbit = staticOrbit(system.moon.orbitAroundPlanet, "moon.orbitAroundPlanet");
  const subsystemMass = planet.massKg + moon.massKg;
  const outerRelative = resolvedState(outerOrbit, star.massKg + subsystemMass, "planet.orbit");
  const [starBody, subsystemMarker] = splitRelativePair(
    star,
    { id: "planet-moon-barycentre", kind: "planet", massKg: subsystemMass, radiusM: 1 },
    outerRelative,
  );
  const innerRelative = resolvedState(innerOrbit, subsystemMass, "moon.orbitAroundPlanet");
  const [planetBody, moonBody] = splitRelativePair(planet, moon, innerRelative, {
    r: {
      x: subsystemMarker.state.positionM[0],
      y: subsystemMarker.state.positionM[1],
      z: subsystemMarker.state.positionM[2],
    },
    v: {
      x: subsystemMarker.state.velocityMps[0],
      y: subsystemMarker.state.velocityMps[1],
      z: subsystemMarker.state.velocityMps[2],
    },
  });
  return {
    bodies: [starBody, planetBody, moonBody],
    periods: [outerOrbit.period, innerOrbit.period],
  };
}

/**
 * Converts browser SystemParams into a validated V5 barycentric scenario with SI state vectors and a TDB epoch.
 * This adapter rejects unsupported dynamics rather than silently changing the scientific request.
 */
export function buildScientificScenarioV5FromSystemParams({
  system,
  binaryMode,
  id = binaryMode ? "detached-binary-v5" : "star-planet-moon-v5",
  epochJdTdb = DEFAULT_EPOCH_JD_TDB,
  targetBodyId = "star",
}: BuildScientificScenarioV5Input): ScientificScenarioV5 {
  if (typeof binaryMode !== "boolean") adapterError("binaryMode must be boolean.");
  if (typeof id !== "string" || id.trim().length === 0) adapterError("id must be a non-empty string.");
  positive(epochJdTdb, "epochJdTdb");
  assertSupportedDynamics(system);
  const converted = binaryMode ? detachedBinaryBodies(system) : generalSystemBodies(system);
  const shortestPeriod = Math.min(...converted.periods);
  const scenario: ScientificScenarioV5 = {
    schemaVersion: SCIENCE_SCHEMA_VERSION,
    id,
    epochJdTdb,
    timeScale: "TDB",
    bodies: converted.bodies,
    observer: { lineOfSight: observerLineOfSight(system), targetBodyId },
    integrator: {
      method: "DOP853",
      positionToleranceM: DEFAULT_POSITION_TOLERANCE_M,
      velocityToleranceMps: DEFAULT_VELOCITY_TOLERANCE_MPS,
      relativeTolerance: DEFAULT_RELATIVE_TOLERANCE,
      maxStepSec: Math.min(DEFAULT_MAX_STEP_SEC, shortestPeriod / 100),
    },
  };
  assertScientificScenarioV5(scenario);
  return scenario;
}

/**
 * Builds the alpha forward request from validated system parameters and preserves caller-supplied time bounds in seconds.
 * Validation occurs before return so malformed sampling grids cannot reach the local science backend.
 */
export function buildScientificForwardRequestFromSystemParams(
  input: BuildScientificForwardRequestInput,
): ForwardRunRequest {
  const request: ForwardRunRequest = {
    kind: "forward",
    scenario: buildScientificScenarioV5FromSystemParams(input),
    startOffsetSec: input.startOffsetSec,
    endOffsetSec: input.endOffsetSec,
    sampleCadenceSec: input.sampleCadenceSec,
    outputs: ["radial-velocity"],
    seed: input.seed,
  };
  assertForwardRunRequest(request);
  return request;
}
