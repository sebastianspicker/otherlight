/** Compiles the supported Education V4 subset into strict barycentric SI V5 requests. */
import type { OrbitElements, SystemDynamicsParams } from "../../domain/model/types";
import { G_SI } from "../../domain/model/units";
import type { Vec3 } from "../../domain/orbits/vec3";
import { stateFromResolvedElements } from "../../domain/simulation/orbits";
import {
  isEducationScenarioV4,
  type MoonBodyV4,
  type PlanetBodyV4,
  type EducationScenarioV4,
  type StarBodyV4,
} from "../../domain/simulation/v4";
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

export type BuildScientificScenarioV5FromEducationScenarioV4Input = {
  scenario: EducationScenarioV4;
  id?: string;
  epochJdTdb?: number;
  targetBodyId?: string;
};

export type BuildScientificForwardRequestFromEducationScenarioV4Input =
  BuildScientificScenarioV5FromEducationScenarioV4Input & {
    startOffsetSec: number;
    endOffsetSec: number;
    sampleCadenceSec: number;
    seed: number;
  };

const KEPLER_PERIOD_RELATIVE_TOLERANCE = 1e-4;
const DEFAULT_POSITION_TOLERANCE_M = 1e-3;
const DEFAULT_VELOCITY_TOLERANCE_MPS = 1e-6;
const DEFAULT_RELATIVE_TOLERANCE = 1e-11;
const DEFAULT_MAX_STEP_SEC = 3_600;

type RelativeState = { r: Vec3; v: Vec3 };
type BodyInput = { id: string; kind: ScientificBodyKind; massKg: number; radiusM: number };

const compilerError = (message: string): never => {
  throw new ScienceValidationError(`Cannot compile an Education V4 scenario to V5: ${message}`);
};

function positive(value: number | undefined, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    compilerError(`${path} must be a finite positive SI value.`);
  }
  return value as number;
}

function staticOrbit(value: unknown, path: string): OrbitElements {
  if (typeof value === "function")
    compilerError(`${path} providers are unsupported; provide static elements.`);
  return value as OrbitElements;
}

function checkedKeplerPeriod(orbit: OrbitElements, totalMassKg: number, path: string): number {
  const semiMajorAxisM = positive(orbit.a, `${path}.a`);
  const suppliedPeriodSec = positive(orbit.period, `${path}.period`);
  const expectedPeriodSec = 2 * Math.PI * Math.sqrt(semiMajorAxisM ** 3 / (G_SI * totalMassKg));
  const relativeError = Math.abs(suppliedPeriodSec - expectedPeriodSec) / expectedPeriodSec;
  if (!Number.isFinite(relativeError) || relativeError > KEPLER_PERIOD_RELATIVE_TOLERANCE) {
    compilerError(
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
    return compilerError(`${path} is invalid (${error instanceof Error ? error.message : String(error)}).`);
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

function assertSupportedDynamics(
  dynamics: SystemDynamicsParams | undefined,
  bodies: readonly (StarBodyV4 | PlanetBodyV4 | MoonBodyV4)[],
): void {
  if (dynamics?.nbodyPlanetMoon?.enabled)
    compilerError("an already-active browser N-body state is unsupported.");
  if (dynamics?.nbodyPlanetMoon?.perturbers?.some((body) => body.enabled !== false))
    compilerError("additional N-body perturbers are unsupported.");
  if (dynamics?.relativity?.enabled) compilerError("relativistic browser dynamics are unsupported.");
  if (dynamics?.secular?.enabled) compilerError("secular browser dynamics are unsupported.");
  if (dynamics?.fidelityProfile && dynamics.fidelityProfile !== "interactive") {
    compilerError("non-interactive browser fidelity profiles are unsupported.");
  }
  if (Object.values(dynamics?.physicsFeatures ?? {}).some((enabled) => enabled)) {
    compilerError("advanced browser physics features are unsupported.");
  }
  if (dynamics?.integrator) compilerError("browser integrator settings are unsupported.");
  if (dynamics?.collisionPolicy?.enabled || (dynamics?.collisionPolicy?.minSeparation ?? 0) > 0) {
    compilerError("browser collision policy settings are unsupported.");
  }
  const timing = dynamics?.exomoonTimingShape;
  if (
    timing?.enabled &&
    [
      timing.moonOmegaDot,
      timing.moonIncDot,
      timing.moonOmegaSmallDot,
      timing.moonImpactYDot,
      timing.moonOmega0,
      timing.moonInc0,
      timing.moonOmegaSmall0,
    ].some((value) => value !== undefined && value !== 0)
  ) {
    compilerError("time-dependent exomoon orientation or sky-plane drift is unsupported.");
  }
  for (const body of bodies) {
    if (body.shape) compilerError(`body "${body.id}" shape settings are unsupported.`);
    if (body.rings) compilerError(`body "${body.id}" ring settings are unsupported.`);
    if (body.spin) compilerError(`body "${body.id}" spin settings are unsupported.`);
    if (body.tides?.enabled) compilerError(`body "${body.id}" tides are unsupported.`);
    const j2 = body.gravityHarmonics?.J2;
    if (j2 !== undefined && (!Number.isFinite(j2) || j2 !== 0))
      compilerError(`body "${body.id}" gravityHarmonics.J2 is unsupported.`);
  }
}

function observerLineOfSight(scenario: EducationScenarioV4): Vector3 {
  const direction = scenario.observer?.dir ?? { x: 0, y: 0, z: 1 };
  const magnitude = Math.hypot(direction.x, direction.y, direction.z);
  if (!Number.isFinite(magnitude) || magnitude === 0)
    compilerError("observer.dir must be a finite non-zero vector.");
  return [direction.x / magnitude, direction.y / magnitude, direction.z / magnitude];
}

function assertV4Input(scenario: EducationScenarioV4): void {
  if (!isEducationScenarioV4(scenario))
    compilerError("scenario must be a structurally valid V4 configuration.");
}

function assertInactiveGeneralSecondary(star: StarBodyV4): void {
  if (star.m !== 0)
    compilerError(`general-lab secondary star "${star.id}" is unsupported; it must have exactly zero mass.`);
}

function assertGeneralHierarchy(
  scenario: EducationScenarioV4,
  planet: PlanetBodyV4,
  moon: MoonBodyV4 | undefined,
): void {
  const expected = new Set([
    `${planet.id}->${planet.parentStarId ?? ""}`,
    ...(moon ? [`${moon.id}->${moon.parentPlanetId}`] : []),
  ]);
  const actual = new Set(scenario.orbits.hierarchy.map((link) => `${link.childId}->${link.parentId}`));
  if (expected.size !== actual.size || [...expected].some((link) => !actual.has(link))) {
    compilerError(
      "general-lab hierarchy must contain only the compiled planet and optional moon orbit links.",
    );
  }
}

function generalBodies(scenario: EducationScenarioV4): { bodies: ScientificBodyV5[]; periods: number[] } {
  const [starA, starB] = scenario.bodies.stars;
  assertInactiveGeneralSecondary(starB);
  if (scenario.bodies.planets.length !== 1)
    compilerError("general-lab requires exactly one planet for the V5 compiler.");
  if (scenario.bodies.moons.length > 1)
    compilerError("general-lab supports at most one moon for the V5 compiler.");
  const planetV4 = scenario.bodies.planets[0];
  const moonV4 = scenario.bodies.moons[0];
  if (moonV4 && moonV4.parentPlanetId !== planetV4.id)
    compilerError("the compiled moon must orbit the compiled planet.");
  assertGeneralHierarchy(scenario, planetV4, moonV4);
  const star: BodyInput = {
    id: "star",
    kind: "star",
    massKg: positive(starA.m, `bodies.stars[0].m`),
    radiusM: positive(starA.r, `bodies.stars[0].r`),
  };
  const planet: BodyInput = {
    id: "planet",
    kind: "planet",
    massKg: positive(planetV4.m, `bodies.planets[0].m`),
    radiusM: positive(planetV4.r, `bodies.planets[0].r`),
  };
  const outerOrbit = staticOrbit(planetV4.orbit, `bodies.planets[0].orbit`);
  if (!moonV4) {
    const relative = resolvedState(outerOrbit, star.massKg + planet.massKg, `bodies.planets[0].orbit`);
    return { bodies: splitRelativePair(star, planet, relative), periods: [outerOrbit.period] };
  }
  const moon: BodyInput = {
    id: "moon",
    kind: "moon",
    massKg: positive(moonV4.m, `bodies.moons[0].m`),
    radiusM: positive(moonV4.r, `bodies.moons[0].r`),
  };
  const subsystemMass = planet.massKg + moon.massKg;
  const outerRelative = resolvedState(outerOrbit, star.massKg + subsystemMass, `bodies.planets[0].orbit`);
  const [starBody, subsystemMarker] = splitRelativePair(
    star,
    { id: "planet-moon-barycentre", kind: "planet", massKg: subsystemMass, radiusM: 1 },
    outerRelative,
  );
  const innerOrbit = staticOrbit(moonV4.orbit, `bodies.moons[0].orbit`);
  const innerRelative = resolvedState(innerOrbit, subsystemMass, `bodies.moons[0].orbit`);
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
  return { bodies: [starBody, planetBody, moonBody], periods: [outerOrbit.period, innerOrbit.period] };
}

function detachedBinaryBodies(scenario: EducationScenarioV4): {
  bodies: ScientificBodyV5[];
  periods: number[];
} {
  if (
    scenario.bodies.planets.length !== 0 ||
    scenario.bodies.moons.length !== 0 ||
    scenario.orbits.hierarchy.length !== 0
  ) {
    compilerError("detached-binary-lab cannot include planets, moons, or hierarchy links.");
  }
  const [starA, starB] = scenario.bodies.stars;
  const primary: BodyInput = {
    id: "star",
    kind: "star",
    massKg: positive(starA.m, `bodies.stars[0].m`),
    radiusM: positive(starA.r, `bodies.stars[0].r`),
  };
  const companion: BodyInput = {
    id: "companion",
    kind: "companion",
    massKg: positive(starB.m, `bodies.stars[1].m`),
    radiusM: positive(starB.r, `bodies.stars[1].r`),
  };
  const orbit = staticOrbit(scenario.orbits.binary, "orbits.binary");
  const relative = resolvedState(orbit, primary.massKg + companion.massKg, "orbits.binary");
  return { bodies: splitRelativePair(primary, companion, relative), periods: [orbit.period] };
}

/** Compiles the supported, already-valid Education V4 subset without sanitizing or approximating it. */
export function buildScientificScenarioV5FromEducationScenarioV4({
  scenario,
  id = scenario.mode === "detached-binary-lab" ? "detached-binary-v5" : "star-planet-moon-v5",
  epochJdTdb = DEFAULT_EPOCH_JD_TDB,
  targetBodyId = "star",
}: BuildScientificScenarioV5FromEducationScenarioV4Input): ScientificScenarioV5 {
  assertV4Input(scenario);
  if (typeof id !== "string" || id.trim().length === 0) compilerError("id must be a non-empty string.");
  positive(epochJdTdb, "epochJdTdb");
  assertSupportedDynamics(scenario.dynamics, [
    ...scenario.bodies.stars,
    ...scenario.bodies.planets,
    ...scenario.bodies.moons,
  ]);
  const converted =
    scenario.mode === "detached-binary-lab" ? detachedBinaryBodies(scenario) : generalBodies(scenario);
  const compiled: ScientificScenarioV5 = {
    schemaVersion: SCIENCE_SCHEMA_VERSION,
    id,
    epochJdTdb,
    timeScale: "TDB",
    bodies: converted.bodies,
    observer: { lineOfSight: observerLineOfSight(scenario), targetBodyId },
    integrator: {
      method: "DOP853",
      positionToleranceM: DEFAULT_POSITION_TOLERANCE_M,
      velocityToleranceMps: DEFAULT_VELOCITY_TOLERANCE_MPS,
      relativeTolerance: DEFAULT_RELATIVE_TOLERANCE,
      maxStepSec: Math.min(DEFAULT_MAX_STEP_SEC, Math.min(...converted.periods) / 100),
    },
  };
  assertScientificScenarioV5(compiled);
  return compiled;
}

/** Builds a validated V5 forward request from an Education V4 scenario. */
export function buildScientificForwardRequestFromEducationScenarioV4(
  input: BuildScientificForwardRequestFromEducationScenarioV4Input,
): ForwardRunRequest {
  const request: ForwardRunRequest = {
    kind: "forward",
    scenario: buildScientificScenarioV5FromEducationScenarioV4(input),
    startOffsetSec: input.startOffsetSec,
    endOffsetSec: input.endOffsetSec,
    sampleCadenceSec: input.sampleCadenceSec,
    outputs: ["radial-velocity"],
    seed: input.seed,
  };
  assertForwardRunRequest(request);
  return request;
}
