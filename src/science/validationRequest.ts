/** Validates forward and inference request unions before service submission. */
import {
  MAX_FORWARD_BODIES,
  MAX_FORWARD_SAMPLES,
  MAX_INTEGRATOR_STEPS,
  type ForwardRunRequest,
  type InferenceRequest,
  type PriorV5,
  type ScienceJobRequest,
} from "./types";
import {
  assertArray,
  assertEnum,
  assertExactKeys,
  assertFinite,
  assertInteger,
  assertPositive,
  assertRecord,
  assertString,
  assertUniqueStrings,
  fail,
  type UnknownRecord,
} from "./validationPrimitives";
import { assertScientificScenarioV5 } from "./validationScenario";

export function assertPrior(value: unknown, path: string): asserts value is PriorV5 {
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

export function assertForwardSampleGrid(request: UnknownRecord): readonly [number, number] {
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
}

export function assertForwardIntegratorBudget(
  forwardScenario: UnknownRecord,
  start: number,
  end: number,
): void {
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
}

export function assertForwardRequest(request: UnknownRecord): void {
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
  const outputs = assertArray(request.outputs, "request.outputs");
  if (outputs.length !== 1 || outputs[0] !== "radial-velocity") {
    fail("request.outputs", "exactly ['radial-velocity'] for the alpha HTTP backend");
  }
  assertInteger(request.seed, "request.seed");
}

export function assertInferenceJobRequest(request: UnknownRecord): void {
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
}

export function assertScienceJobRequest(value: unknown): asserts value is ScienceJobRequest {
  const request = assertRecord(value, "request");
  const kind = assertEnum(request.kind, "request.kind", ["forward", "inference"]);
  if (kind === "forward") return assertForwardRequest(request);
  assertInferenceJobRequest(request);
}

export function assertForwardRunRequest(value: unknown): asserts value is ForwardRunRequest {
  assertScienceJobRequest(value);
  if (value.kind !== "forward") fail("request.kind", "exactly 'forward'");
}

export function assertInferenceRequest(value: unknown): asserts value is InferenceRequest {
  assertScienceJobRequest(value);
  if (value.kind !== "inference") fail("request.kind", "exactly 'inference'");
}
