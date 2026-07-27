/**
 * Runtime-validates every Scientific request and response before untrusted JSON
 * can enter typed browser state or cross the local service boundary.
 */
import {
  MAX_FORWARD_BODIES,
  MAX_FORWARD_SAMPLES,
  MAX_INTEGRATOR_STEPS,
  MIN_RELATIVE_TOLERANCE,
  RUN_MANIFEST_V2_SCHEMA_VERSION,
  SCIENCE_SCHEMA_VERSION,
  type CapabilityManifest,
  type ForwardRunRequest,
  type InferenceRequest,
  type JobKind,
  type JobState,
  type PriorV5,
  type RunManifest,
  type ScienceJobRequest,
  type ScienceJobResult,
  type ScienceJobStatus,
  type ScientificScenarioV5,
  type Vector3,
} from "./types";

export class ScienceValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScienceValidationError";
  }
}

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const assertRecord = (value: unknown, path: string): UnknownRecord => {
  if (!isRecord(value)) fail(path, "an object");
  return value as UnknownRecord;
};

const fail = (path: string, expectation: string): never => {
  throw new ScienceValidationError(`${path} must be ${expectation}.`);
};

const assertExactKeys = (value: UnknownRecord, path: string, keys: readonly string[]): void => {
  for (const key of Object.keys(value)) if (!keys.includes(key)) fail(`${path}.${key}`, "unsupported");
};

const assertString = (value: unknown, path: string): string => {
  if (typeof value !== "string" || value.trim().length === 0) fail(path, "a non-empty string");
  return value as string;
};

const assertTimestamp = (value: unknown, path: string): string => {
  const timestamp = assertString(value, path);
  if (!Number.isFinite(Date.parse(timestamp))) fail(path, "an ISO-8601 timestamp");
  return timestamp;
};

const assertFinite = (value: unknown, path: string): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) fail(path, "a finite number");
  return value as number;
};

const assertPositive = (value: unknown, path: string): number => {
  const number = assertFinite(value, path);
  if (number <= 0) fail(path, "greater than zero");
  return number;
};

const assertNonNegative = (value: unknown, path: string): number => {
  const number = assertFinite(value, path);
  if (number < 0) fail(path, "zero or greater");
  return number;
};

const assertInteger = (value: unknown, path: string): number => {
  const number = assertFinite(value, path);
  if (!Number.isSafeInteger(number)) fail(path, "a safe integer");
  return number;
};

const assertEnum = <T extends string>(value: unknown, path: string, allowed: readonly T[]): T => {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    fail(path, `one of ${allowed.join(", ")}`);
  }
  return value as T;
};

const assertArray = (value: unknown, path: string): unknown[] => {
  if (!Array.isArray(value)) fail(path, "an array");
  return value as unknown[];
};

const assertUniqueStrings = (values: readonly string[], path: string): void => {
  if (new Set(values).size !== values.length) fail(path, "an array with unique values");
};

const assertVector3 = (value: unknown, path: string): Vector3 => {
  const values = assertArray(value, path);
  if (values.length !== 3) fail(path, "a three-dimensional vector");
  return [
    assertFinite(values[0], `${path}[0]`),
    assertFinite(values[1], `${path}[1]`),
    assertFinite(values[2], `${path}[2]`),
  ];
};

const vectorMagnitude = ([x, y, z]: Vector3): number => Math.hypot(x, y, z);

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

function assertBarycentricState(bodies: readonly ValidatedBodyState[]): void {
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

function assertNoInitialOverlaps(bodies: readonly ValidatedBodyState[]): void {
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

/** Strictly validates the V5 SI/TDB barycentric scenario contract and throws on unknown or inconsistent fields. */
export function assertScientificScenarioV5(value: unknown): asserts value is ScientificScenarioV5 {
  const scenario = assertRecord(value, "scenario");
  assertScenarioHeader(scenario);
  const bodyIds = assertScenarioBodies(scenario);
  assertScenarioObserver(scenario, bodyIds);
  assertScenarioIntegrator(scenario);
}

const assertScenarioHeader = (scenario: UnknownRecord): void => {
  assertExactKeys(scenario, "scenario", [
    "schemaVersion",
    "id",
    "epochJdTdb",
    "timeScale",
    "bodies",
    "observer",
    "integrator",
  ]);
  if (scenario.schemaVersion !== SCIENCE_SCHEMA_VERSION)
    fail("scenario.schemaVersion", `exactly '${SCIENCE_SCHEMA_VERSION}'`);
  assertString(scenario.id, "scenario.id");
  assertPositive(scenario.epochJdTdb, "scenario.epochJdTdb");
  if (scenario.timeScale !== "TDB") fail("scenario.timeScale", "exactly 'TDB'");
};

const assertScenarioBodies = (scenario: UnknownRecord): string[] => {
  const bodies = assertArray(scenario.bodies, "scenario.bodies");
  if (bodies.length < 2) fail("scenario.bodies", "an array with at least two bodies");
  const bodyIds: string[] = [];
  const validatedBodies: ValidatedBodyState[] = [];
  for (let index = 0; index < bodies.length; index++) {
    const bodyPath = `scenario.bodies[${index}]`;
    const body = assertRecord(bodies[index], bodyPath);
    assertExactKeys(body, bodyPath, ["id", "kind", "massKg", "radiusM", "state"]);
    const id = assertString(body.id, `${bodyPath}.id`);
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
};

const assertScenarioObserver = (scenario: UnknownRecord, bodyIds: readonly string[]): void => {
  const observer = assertRecord(scenario.observer, "scenario.observer");
  assertExactKeys(observer, "scenario.observer", ["lineOfSight", "targetBodyId", "distanceM"]);
  const lineOfSight = assertVector3(observer.lineOfSight, "scenario.observer.lineOfSight");
  if (Math.abs(vectorMagnitude(lineOfSight) - 1) > 1e-12) {
    fail("scenario.observer.lineOfSight", "a unit vector within 1e-12");
  }
  if (observer.distanceM !== undefined) assertPositive(observer.distanceM, "scenario.observer.distanceM");
  const targetBodyId = assertString(observer.targetBodyId, "scenario.observer.targetBodyId");
  if (!bodyIds.includes(targetBodyId)) {
    fail("scenario.observer.targetBodyId", "the id of a scenario body");
  }
};

const assertScenarioIntegrator = (scenario: UnknownRecord): void => {
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
  if (relativeTolerance >= 1) {
    fail("scenario.integrator.relativeTolerance", "less than one");
  }
  assertPositive(integrator.maxStepSec, "scenario.integrator.maxStepSec");
};

function assertPrior(value: unknown, path: string): asserts value is PriorV5 {
  const prior = assertRecord(value, path);
  const distribution = assertEnum(prior.distribution, `${path}.distribution`, [
    "uniform",
    "log-uniform",
    "normal",
    "truncated-normal",
  ]);
  const lowerUpper = (): void => {
    const lower = assertFinite(prior.lower, `${path}.lower`);
    const upper = assertFinite(prior.upper, `${path}.upper`);
    if (lower >= upper) fail(path, "a prior whose lower bound is less than its upper bound");
  };
  if (distribution === "uniform" || distribution === "log-uniform") {
    assertExactKeys(prior, path, ["distribution", "lower", "upper"]);
    lowerUpper();
    if (distribution === "log-uniform" && assertFinite(prior.lower, `${path}.lower`) <= 0) {
      fail(`${path}.lower`, "greater than zero for a log-uniform prior");
    }
    return;
  }
  if (distribution === "normal") {
    assertExactKeys(prior, path, ["distribution", "mean", "standardDeviation"]);
    assertFinite(prior.mean, `${path}.mean`);
    assertPositive(prior.standardDeviation, `${path}.standardDeviation`);
    return;
  }
  assertExactKeys(prior, path, ["distribution", "mean", "standardDeviation", "lower", "upper"]);
  assertFinite(prior.mean, `${path}.mean`);
  assertPositive(prior.standardDeviation, `${path}.standardDeviation`);
  lowerUpper();
}

/** Strictly validates a union job request before it can cross the local science-backend boundary. */
export function assertScienceJobRequest(value: unknown): asserts value is ScienceJobRequest {
  const request = assertRecord(value, "request");
  const kind = assertEnum(request.kind, "request.kind", ["forward", "inference"]);
  if (kind === "forward") return assertForwardRequest(request);
  assertInferenceJobRequest(request);
}

const assertForwardSampleGrid = (request: UnknownRecord): readonly [number, number] => {
  const start = assertFinite(request.startOffsetSec, "request.startOffsetSec");
  const end = assertFinite(request.endOffsetSec, "request.endOffsetSec");
  if (end <= start) fail("request.endOffsetSec", "greater than request.startOffsetSec");
  const cadence = assertPositive(request.sampleCadenceSec, "request.sampleCadenceSec");
  const span = end - start;
  const sampleCount = Math.floor(span / cadence) + 1;
  if (!Number.isFinite(span) || !Number.isSafeInteger(sampleCount) || sampleCount > MAX_FORWARD_SAMPLES) {
    fail("request", `at most ${MAX_FORWARD_SAMPLES} finite forward samples`);
  }
  let previousSample = start;
  for (let index = 1; index < sampleCount; index += 1) {
    const sample = start + index * cadence;
    if (!Number.isFinite(sample) || sample <= previousSample) {
      fail("request", "a strictly increasing sample grid representable as IEEE-754 double-precision values");
    }
    previousSample = sample;
  }
  return [start, end];
};

const assertForwardIntegratorBudget = (forwardScenario: UnknownRecord, start: number, end: number): void => {
  const integrator = assertRecord(forwardScenario.integrator, "request.scenario.integrator");
  const maxStepSec = assertPositive(integrator.maxStepSec, "request.scenario.integrator.maxStepSec");
  const minimumStepCount =
    Math.ceil(Math.max(0, end) / maxStepSec) + Math.ceil(Math.max(0, -start) / maxStepSec);
  if (!Number.isSafeInteger(minimumStepCount) || minimumStepCount > MAX_INTEGRATOR_STEPS) {
    fail(
      "request.scenario.integrator.maxStepSec",
      `a requested span requiring at most ${MAX_INTEGRATOR_STEPS} integration steps`,
    );
  }
};

const assertForwardOutputs = (value: unknown): void => {
  const outputs = assertArray(value, "request.outputs");
  if (outputs.length !== 1 || outputs[0] !== "radial-velocity") {
    fail("request.outputs", "exactly ['radial-velocity'] for the alpha HTTP backend");
  }
};

const assertForwardRequest = (request: UnknownRecord): void => {
  assertExactKeys(request, "request", [
    "kind",
    "scenario",
    "startOffsetSec",
    "endOffsetSec",
    "sampleCadenceSec",
    "outputs",
    "seed",
  ]);
  const forwardScenario = assertRecord(request.scenario, "request.scenario");
  const forwardBodies = assertArray(forwardScenario.bodies, "request.scenario.bodies");
  if (forwardBodies.length > MAX_FORWARD_BODIES) {
    fail("request.scenario.bodies", `at most ${MAX_FORWARD_BODIES} bodies for a forward request`);
  }
  assertScientificScenarioV5(request.scenario);
  const [start, end] = assertForwardSampleGrid(request);
  assertForwardIntegratorBudget(forwardScenario, start, end);
  assertForwardOutputs(request.outputs);
  assertInteger(request.seed, "request.seed");
};

const assertInferenceJobRequest = (request: UnknownRecord): void => {
  assertExactKeys(request, "request", [
    "kind",
    "scenario",
    "observations",
    "parameters",
    "sampler",
    "seed",
    "maxWallTimeSec",
  ]);
  assertScientificScenarioV5(request.scenario);
  const observations = assertArray(request.observations, "request.observations");
  if (observations.length === 0) fail("request.observations", "a non-empty array");
  const observationIds: string[] = [];
  for (let index = 0; index < observations.length; index++) {
    const path = `request.observations[${index}]`;
    const observation = assertRecord(observations[index], path);
    assertExactKeys(observation, path, ["id", "kind", "datasetId"]);
    observationIds.push(assertString(observation.id, `${path}.id`));
    assertEnum(observation.kind, `${path}.kind`, ["photometry", "radial-velocity", "astrometry", "timing"]);
    assertString(observation.datasetId, `${path}.datasetId`);
  }
  assertUniqueStrings(observationIds, "request.observations");
  const parameters = assertArray(request.parameters, "request.parameters");
  if (parameters.length === 0) fail("request.parameters", "a non-empty array");
  const parameterIds: string[] = [];
  for (let index = 0; index < parameters.length; index++) {
    const path = `request.parameters[${index}]`;
    const parameter = assertRecord(parameters[index], path);
    assertExactKeys(parameter, path, ["id", "prior"]);
    parameterIds.push(assertString(parameter.id, `${path}.id`));
    assertPrior(parameter.prior, `${path}.prior`);
  }
  assertUniqueStrings(parameterIds, "request.parameters");
  assertEnum(request.sampler, "request.sampler", ["emcee", "dynesty"]);
  assertInteger(request.seed, "request.seed");
  assertPositive(request.maxWallTimeSec, "request.maxWallTimeSec");
};

/** Strictly validates the backend capability manifest; unsupported fields and versions are rejected. */
export function assertCapabilityManifest(value: unknown): asserts value is CapabilityManifest {
  const capabilities = assertRecord(value, "capabilities");
  assertExactKeys(capabilities, "capabilities", [
    "schemaVersion",
    "serviceVersion",
    "generatedAt",
    "supportedJobKinds",
    "supportedOutputs",
    "supportedSamplers",
    "unavailableModelIds",
  ]);
  if (capabilities.schemaVersion !== SCIENCE_SCHEMA_VERSION)
    fail("capabilities.schemaVersion", `exactly '${SCIENCE_SCHEMA_VERSION}'`);
  assertString(capabilities.serviceVersion, "capabilities.serviceVersion");
  assertTimestamp(capabilities.generatedAt, "capabilities.generatedAt");
  const jobKinds = assertArray(capabilities.supportedJobKinds, "capabilities.supportedJobKinds").map(
    (entry, index) => assertEnum(entry, `capabilities.supportedJobKinds[${index}]`, ["forward", "inference"]),
  );
  assertUniqueStrings(jobKinds, "capabilities.supportedJobKinds");
  const outputs = assertArray(capabilities.supportedOutputs, "capabilities.supportedOutputs").map(
    (entry, index) => assertEnum(entry, `capabilities.supportedOutputs[${index}]`, ["radial-velocity"]),
  );
  assertUniqueStrings(outputs, "capabilities.supportedOutputs");
  const samplers = assertArray(capabilities.supportedSamplers, "capabilities.supportedSamplers").map(
    (entry, index) => assertEnum(entry, `capabilities.supportedSamplers[${index}]`, ["emcee", "dynesty"]),
  );
  assertUniqueStrings(samplers, "capabilities.supportedSamplers");
  const unavailable = assertArray(capabilities.unavailableModelIds, "capabilities.unavailableModelIds").map(
    (entry, index) => assertString(entry, `capabilities.unavailableModelIds[${index}]`),
  );
  assertUniqueStrings(unavailable, "capabilities.unavailableModelIds");
}

/** Strictly validates reproducibility metadata returned for a completed scientific run. */
export function assertRunManifest(value: unknown): asserts value is RunManifest {
  const manifest = assertRecord(value, "runManifest");
  assertRunManifestHeader(manifest);
  assertRunManifestVariant(manifest);
  assertRunManifestTimingAndModels(manifest);
  assertRunManifestTolerances(manifest);
  assertRunManifestLists(manifest);
}

const assertRunManifestHeader = (manifest: UnknownRecord): void => {
  const commonKeys = [
    "schemaVersion",
    "runId",
    "inputHashSha256",
    "scientificResult",
    "gravitationalConstantM3KgS2",
    "epochJdTdb",
    "startedAt",
    "completedAt",
    "capabilityManifestVersion",
    "modelVersions",
    "numericalTolerances",
    "datasets",
    "validityDomain",
    "warnings",
    "randomSeed",
  ] as const;
  if (manifest.schemaVersion === SCIENCE_SCHEMA_VERSION) {
    assertExactKeys(manifest, "runManifest", [...commonKeys, "softwareVersions"]);
  } else if (manifest.schemaVersion === RUN_MANIFEST_V2_SCHEMA_VERSION) {
    assertExactKeys(manifest, "runManifest", [...commonKeys, "implementation", "artifact"]);
  } else {
    fail(
      "runManifest.schemaVersion",
      `exactly '${SCIENCE_SCHEMA_VERSION}' or '${RUN_MANIFEST_V2_SCHEMA_VERSION}'`,
    );
  }
  assertString(manifest.runId, "runManifest.runId");
  const hash = assertString(manifest.inputHashSha256, "runManifest.inputHashSha256");
  if (!/^[a-f0-9]{64}$/.test(hash))
    fail("runManifest.inputHashSha256", "a lowercase SHA-256 hexadecimal digest");
  if (manifest.scientificResult !== true) fail("runManifest.scientificResult", "exactly true");
};

const assertRunManifestV1Versions = (manifest: UnknownRecord): void => {
  const versions = assertRecord(manifest.softwareVersions, "runManifest.softwareVersions");
  assertExactKeys(versions, "runManifest.softwareVersions", [
    "backend",
    "engine",
    "python",
    "scipy",
    "pyarrow",
  ]);
  for (const name of ["backend", "engine", "python", "scipy", "pyarrow"] as const) {
    assertString(versions[name], `runManifest.softwareVersions.${name}`);
  }
};

const assertNamedVersion = (value: unknown, path: string): void => {
  const record = assertRecord(value, path);
  assertExactKeys(record, path, ["name", "version"]);
  assertString(record.name, `${path}.name`);
  assertString(record.version, `${path}.version`);
};

const assertRunManifestV2Implementation = (manifest: UnknownRecord): void => {
  const implementation = assertRecord(manifest.implementation, "runManifest.implementation");
  assertExactKeys(implementation, "runManifest.implementation", [
    "application",
    "engine",
    "runtime",
    "artifactWriter",
    "platform",
  ]);
  const application = assertRecord(implementation.application, "runManifest.implementation.application");
  assertExactKeys(application, "runManifest.implementation.application", ["name", "version", "build"]);
  assertString(application.name, "runManifest.implementation.application.name");
  assertString(application.version, "runManifest.implementation.application.version");
  assertString(application.build, "runManifest.implementation.application.build");
  const engine = assertRecord(implementation.engine, "runManifest.implementation.engine");
  assertExactKeys(engine, "runManifest.implementation.engine", ["kind", "name", "version"]);
  assertEnum(engine.kind, "runManifest.implementation.engine.kind", ["python-scipy", "swift-native"]);
  assertString(engine.name, "runManifest.implementation.engine.name");
  assertString(engine.version, "runManifest.implementation.engine.version");
  assertNamedVersion(implementation.runtime, "runManifest.implementation.runtime");
  assertNamedVersion(implementation.artifactWriter, "runManifest.implementation.artifactWriter");
  const platform = assertRecord(implementation.platform, "runManifest.implementation.platform");
  assertExactKeys(platform, "runManifest.implementation.platform", ["os", "architecture"]);
  assertString(platform.os, "runManifest.implementation.platform.os");
  assertString(platform.architecture, "runManifest.implementation.platform.architecture");

  const artifact = assertRecord(manifest.artifact, "runManifest.artifact");
  assertExactKeys(artifact, "runManifest.artifact", ["idSha256", "format", "schemaVersion", "rowCount"]);
  const artifactHash = assertString(artifact.idSha256, "runManifest.artifact.idSha256");
  if (!/^[a-f0-9]{64}$/.test(artifactHash))
    fail("runManifest.artifact.idSha256", "a lowercase SHA-256 hexadecimal digest");
  if (artifact.format !== "arrow-ipc-file") fail("runManifest.artifact.format", "exactly 'arrow-ipc-file'");
  if (artifact.schemaVersion !== "radial-velocity-v1")
    fail("runManifest.artifact.schemaVersion", "exactly 'radial-velocity-v1'");
  const rowCount = assertInteger(artifact.rowCount, "runManifest.artifact.rowCount");
  if (rowCount < 1 || rowCount > MAX_FORWARD_SAMPLES)
    fail("runManifest.artifact.rowCount", `between 1 and ${MAX_FORWARD_SAMPLES}`);
};

const assertRunManifestVariant = (manifest: UnknownRecord): void => {
  if (manifest.schemaVersion === SCIENCE_SCHEMA_VERSION) {
    assertRunManifestV1Versions(manifest);
    return;
  }
  assertRunManifestV2Implementation(manifest);
};

const assertRunManifestTimingAndModels = (manifest: UnknownRecord): void => {
  assertPositive(manifest.gravitationalConstantM3KgS2, "runManifest.gravitationalConstantM3KgS2");
  assertPositive(manifest.epochJdTdb, "runManifest.epochJdTdb");
  assertTimestamp(manifest.startedAt, "runManifest.startedAt");
  if (manifest.completedAt !== undefined) assertTimestamp(manifest.completedAt, "runManifest.completedAt");
  assertString(manifest.capabilityManifestVersion, "runManifest.capabilityManifestVersion");
  const modelVersions = assertArray(manifest.modelVersions, "runManifest.modelVersions");
  if (modelVersions.length === 0) fail("runManifest.modelVersions", "a non-empty array");
  const modelIds: string[] = [];
  for (let index = 0; index < modelVersions.length; index++) {
    const path = `runManifest.modelVersions[${index}]`;
    const model = assertRecord(modelVersions[index], path);
    assertExactKeys(model, path, ["id", "version"]);
    modelIds.push(assertString(model.id, `${path}.id`));
    assertString(model.version, `${path}.version`);
  }
  assertUniqueStrings(modelIds, "runManifest.modelVersions");
};

const assertRunManifestTolerances = (manifest: UnknownRecord): void => {
  const tolerances = assertRecord(manifest.numericalTolerances, "runManifest.numericalTolerances");
  const toleranceKeys = [
    "requestedPositionToleranceM",
    "effectivePositionToleranceM",
    "requestedVelocityToleranceMps",
    "effectiveVelocityToleranceMps",
    "requestedRelativeTolerance",
    "effectiveRelativeTolerance",
    "requestedMaxStepSec",
    "effectiveMaxStepSec",
  ] as const;
  assertExactKeys(tolerances, "runManifest.numericalTolerances", toleranceKeys);
  for (const name of toleranceKeys) {
    assertPositive(tolerances[name], `runManifest.numericalTolerances.${name}`);
  }
  const tolerancePairs = [
    ["requestedPositionToleranceM", "effectivePositionToleranceM"],
    ["requestedVelocityToleranceMps", "effectiveVelocityToleranceMps"],
    ["requestedRelativeTolerance", "effectiveRelativeTolerance"],
    ["requestedMaxStepSec", "effectiveMaxStepSec"],
  ] as const;
  for (const [requested, effective] of tolerancePairs) {
    if (tolerances[requested] !== tolerances[effective]) {
      fail(`runManifest.numericalTolerances.${effective}`, `equal to ${requested} for this alpha`);
    }
  }
  const requestedRelative = tolerances.requestedRelativeTolerance as number;
  if (requestedRelative < MIN_RELATIVE_TOLERANCE || requestedRelative >= 1) {
    fail("runManifest.numericalTolerances.requestedRelativeTolerance", `in [${MIN_RELATIVE_TOLERANCE}, 1)`);
  }
};

const assertRunManifestLists = (manifest: UnknownRecord): void => {
  const datasets = assertArray(manifest.datasets, "runManifest.datasets");
  const datasetIds: string[] = [];
  for (let index = 0; index < datasets.length; index++) {
    const path = `runManifest.datasets[${index}]`;
    const dataset = assertRecord(datasets[index], path);
    assertExactKeys(dataset, path, ["id", "version", "sha256"]);
    datasetIds.push(assertString(dataset.id, `${path}.id`));
    assertString(dataset.version, `${path}.version`);
    const datasetHash = assertString(dataset.sha256, `${path}.sha256`);
    if (!/^[a-f0-9]{64}$/.test(datasetHash)) fail(`${path}.sha256`, "a lowercase SHA-256 hexadecimal digest");
  }
  assertUniqueStrings(datasetIds, "runManifest.datasets");
  const validityDomain = assertArray(manifest.validityDomain, "runManifest.validityDomain").map(
    (entry, index) => assertString(entry, `runManifest.validityDomain[${index}]`),
  );
  if (validityDomain.length === 0) fail("runManifest.validityDomain", "a non-empty array");
  assertUniqueStrings(validityDomain, "runManifest.validityDomain");
  const warnings = assertArray(manifest.warnings, "runManifest.warnings").map((entry, index) =>
    assertString(entry, `runManifest.warnings[${index}]`),
  );
  assertUniqueStrings(warnings, "runManifest.warnings");
  assertInteger(manifest.randomSeed, "runManifest.randomSeed");
};

/** Strictly validates a job-status response before polling or UI code observes its lifecycle state. */
export function assertScienceJobStatus(value: unknown): asserts value is ScienceJobStatus {
  const job = assertRecord(value, "job");
  assertExactKeys(job, "job", ["id", "kind", "state", "submittedAt", "updatedAt", "progress", "error"]);
  assertString(job.id, "job.id");
  assertEnum(job.kind, "job.kind", ["forward", "inference"] satisfies readonly JobKind[]);
  const state = assertEnum(job.state, "job.state", [
    "queued",
    "running",
    "succeeded",
    "failed",
    "cancelled",
  ] satisfies readonly JobState[]);
  assertTimestamp(job.submittedAt, "job.submittedAt");
  assertTimestamp(job.updatedAt, "job.updatedAt");
  const progress = assertNonNegative(job.progress, "job.progress");
  if (progress > 1) fail("job.progress", "between zero and one");
  if (job.error !== undefined) {
    const error = assertRecord(job.error, "job.error");
    assertExactKeys(error, "job.error", ["code", "message"]);
    assertString(error.code, "job.error.code");
    assertString(error.message, "job.error.message");
  }
  if (state === "failed" && job.error === undefined) fail("job.error", "provided when job.state is failed");
  if (state !== "failed" && job.error !== undefined) fail("job.error", "omitted unless job.state is failed");
}

/** Strictly validates a terminal job result, including its manifest and kind-specific payload. */
export function assertScienceJobResult(value: unknown): asserts value is ScienceJobResult {
  const result = assertRecord(value, "result");
  const kind = assertEnum(result.kind, "result.kind", ["forward", "inference"]);
  const keys =
    kind === "forward"
      ? ["kind", "runManifest", "arrowArtifactId"]
      : ["kind", "runManifest", "arrowArtifactId", "logEvidence"];
  assertExactKeys(result, "result", keys);
  assertRunManifest(result.runManifest);
  const artifactId = assertString(result.arrowArtifactId, "result.arrowArtifactId");
  if (!/^[a-f0-9]{64}$/.test(artifactId)) {
    fail("result.arrowArtifactId", "a lowercase SHA-256 hexadecimal digest");
  }
  const manifest = result.runManifest as UnknownRecord;
  if (manifest.schemaVersion === RUN_MANIFEST_V2_SCHEMA_VERSION) {
    const artifact = manifest.artifact as UnknownRecord;
    if (artifact.idSha256 !== artifactId) {
      fail("result.arrowArtifactId", "equal to runManifest.artifact.idSha256");
    }
  }
  if (kind === "inference" && result.logEvidence !== undefined)
    assertFinite(result.logEvidence, "result.logEvidence");
}

/** Strictly validates the constrained forward-run subset used by the alpha local HTTP backend. */
export function assertForwardRunRequest(value: unknown): asserts value is ForwardRunRequest {
  assertScienceJobRequest(value);
  if (value.kind !== "forward") fail("request.kind", "exactly 'forward'");
}

/** Strictly validates an inference request before it is submitted to the local science backend. */
export function assertInferenceRequest(value: unknown): asserts value is InferenceRequest {
  assertScienceJobRequest(value);
  if (value.kind !== "inference") fail("request.kind", "exactly 'inference'");
}
