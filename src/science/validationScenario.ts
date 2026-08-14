/** Validates strict V5 barycentric scenarios, bodies, observers, and integrator settings. */
import {
  MIN_RELATIVE_TOLERANCE,
  SCIENCE_SCHEMA_VERSION,
  type ScientificScenarioV5,
  type Vector3,
} from "./types";
import {
  assertArray,
  assertEnum,
  assertExactKeys,
  assertIdentifier,
  assertPositive,
  assertRecord,
  assertUniqueStrings,
  assertVector3,
  fail,
  vectorMagnitude,
  type UnknownRecord,
} from "./validationPrimitives";

const BARYCENTRE_RELATIVE_TOLERANCE = 1e-12;
const BARYCENTRE_POSITION_FLOOR_M = 1e-3;
const BARYCENTRE_VELOCITY_FLOOR_MPS = 1e-9;

type ValidatedBodyState = {
  id: string;
  massKg: number;
  radiusM: number;
  positionM: Vector3;
  velocityMps: Vector3;
};

export function assertBarycentricState(bodies: readonly ValidatedBodyState[]): void {
  const totalMass = bodies.reduce((sum, body) => sum + body.massKg, 0);
  if (!Number.isFinite(totalMass)) fail("scenario.bodies", "a system with finite total mass");
  const weighted = (field: "positionM" | "velocityMps"): Vector3 =>
    ([0, 1, 2] as const).map((axis) =>
      bodies.reduce((sum, body) => sum + body.massKg * body[field][axis], 0),
    ) as unknown as Vector3;
  const positionResidualM = vectorMagnitude(weighted("positionM")) / totalMass;
  const velocityResidualMps = vectorMagnitude(weighted("velocityMps")) / totalMass;
  const positionScaleM = Math.max(...bodies.map((body) => vectorMagnitude(body.positionM)));
  const velocityScaleMps = Math.max(...bodies.map((body) => vectorMagnitude(body.velocityMps)));
  const positionLimitM = Math.max(
    BARYCENTRE_POSITION_FLOOR_M,
    BARYCENTRE_RELATIVE_TOLERANCE * positionScaleM,
  );
  const velocityLimitMps = Math.max(
    BARYCENTRE_VELOCITY_FLOOR_MPS,
    BARYCENTRE_RELATIVE_TOLERANCE * velocityScaleMps,
  );
  if (!Number.isFinite(positionResidualM) || positionResidualM > positionLimitM) {
    fail("scenario.bodies", `barycentric in position (mass-weighted offset <= ${positionLimitM} m)`);
  }
  if (!Number.isFinite(velocityResidualMps) || velocityResidualMps > velocityLimitMps) {
    fail(
      "scenario.bodies",
      `zero-total-momentum in velocity (centre-of-mass speed <= ${velocityLimitMps} m/s)`,
    );
  }
}

export function assertNoInitialOverlaps(bodies: readonly ValidatedBodyState[]): void {
  for (let left = 0; left < bodies.length; left++) {
    for (let right = left + 1; right < bodies.length; right++) {
      const first = bodies[left];
      const second = bodies[right];
      const displacement: Vector3 = [
        second.positionM[0] - first.positionM[0],
        second.positionM[1] - first.positionM[1],
        second.positionM[2] - first.positionM[2],
      ];
      if (vectorMagnitude(displacement) <= first.radiusM + second.radiusM) {
        fail(
          "scenario.bodies",
          `initially non-overlapping (${first.id} and ${second.id} are in finite-radius contact)`,
        );
      }
    }
  }
}

export function assertScenarioHeader(scenario: UnknownRecord): void {
  assertExactKeys(scenario, "scenario", [
    "schemaVersion",
    "id",
    "epochJdTdb",
    "timeScale",
    "bodies",
    "observer",
    "integrator",
  ]);
  if (scenario.schemaVersion !== SCIENCE_SCHEMA_VERSION) {
    fail("scenario.schemaVersion", `exactly '${SCIENCE_SCHEMA_VERSION}'`);
  }
  assertIdentifier(scenario.id, "scenario.id");
  assertPositive(scenario.epochJdTdb, "scenario.epochJdTdb");
  if (scenario.timeScale !== "TDB") fail("scenario.timeScale", "exactly 'TDB'");
}

export function assertScenarioBodies(scenario: UnknownRecord): string[] {
  const bodies = assertArray(scenario.bodies, "scenario.bodies");
  if (bodies.length < 2) fail("scenario.bodies", "an array with at least two bodies");
  const bodyIds: string[] = [];
  const validatedBodies: ValidatedBodyState[] = [];
  for (let index = 0; index < bodies.length; index++) {
    const bodyPath = `scenario.bodies[${index}]`;
    const body = assertRecord(bodies[index], bodyPath);
    assertExactKeys(body, bodyPath, ["id", "kind", "massKg", "radiusM", "state"]);
    const id = assertIdentifier(body.id, `${bodyPath}.id`);
    bodyIds.push(id);
    assertEnum(body.kind, `${bodyPath}.kind`, ["star", "planet", "moon", "companion"]);
    const massKg = assertPositive(body.massKg, `${bodyPath}.massKg`);
    const radiusM = assertPositive(body.radiusM, `${bodyPath}.radiusM`);
    const state = assertRecord(body.state, `${bodyPath}.state`);
    assertExactKeys(state, `${bodyPath}.state`, ["positionM", "velocityMps"]);
    const positionM = assertVector3(state.positionM, `${bodyPath}.state.positionM`);
    const velocityMps = assertVector3(state.velocityMps, `${bodyPath}.state.velocityMps`);
    validatedBodies.push({ id, massKg, radiusM, positionM, velocityMps });
  }
  assertUniqueStrings(bodyIds, "scenario.bodies");
  assertBarycentricState(validatedBodies);
  assertNoInitialOverlaps(validatedBodies);
  return bodyIds;
}

export function assertScenarioObserver(scenario: UnknownRecord, bodyIds: readonly string[]): void {
  const observer = assertRecord(scenario.observer, "scenario.observer");
  assertExactKeys(observer, "scenario.observer", ["lineOfSight", "targetBodyId", "distanceM"]);
  const lineOfSight = assertVector3(observer.lineOfSight, "scenario.observer.lineOfSight");
  if (Math.abs(vectorMagnitude(lineOfSight) - 1) > 1e-12) {
    fail("scenario.observer.lineOfSight", "a unit vector within 1e-12");
  }
  if (observer.distanceM !== undefined) assertPositive(observer.distanceM, "scenario.observer.distanceM");
  const targetBodyId = assertIdentifier(observer.targetBodyId, "scenario.observer.targetBodyId");
  if (!bodyIds.includes(targetBodyId)) fail("scenario.observer.targetBodyId", "the id of a scenario body");
}

export function assertScenarioIntegrator(scenario: UnknownRecord): void {
  const integrator = assertRecord(scenario.integrator, "scenario.integrator");
  assertExactKeys(integrator, "scenario.integrator", [
    "method",
    "positionToleranceM",
    "velocityToleranceMps",
    "relativeTolerance",
    "maxStepSec",
  ]);
  if (integrator.method !== "DOP853") fail("scenario.integrator.method", "exactly 'DOP853'");
  assertPositive(integrator.positionToleranceM, "scenario.integrator.positionToleranceM");
  assertPositive(integrator.velocityToleranceMps, "scenario.integrator.velocityToleranceMps");
  const relativeTolerance = assertPositive(
    integrator.relativeTolerance,
    "scenario.integrator.relativeTolerance",
  );
  if (relativeTolerance < MIN_RELATIVE_TOLERANCE) {
    fail(
      "scenario.integrator.relativeTolerance",
      `at least the SciPy/IEEE-754 floor ${MIN_RELATIVE_TOLERANCE}`,
    );
  }
  if (relativeTolerance >= 1) fail("scenario.integrator.relativeTolerance", "less than one");
  assertPositive(integrator.maxStepSec, "scenario.integrator.maxStepSec");
}

export function assertScientificScenarioV5(value: unknown): asserts value is ScientificScenarioV5 {
  const scenario = assertRecord(value, "scenario");
  assertScenarioHeader(scenario);
  const bodyIds = assertScenarioBodies(scenario);
  assertScenarioObserver(scenario, bodyIds);
  assertScenarioIntegrator(scenario);
}
