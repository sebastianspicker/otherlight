/** Verifies contracts client compatibility across the browser and science-service boundary. */

import { describe, expect, it, vi } from "vitest";
import contractCases from "../../contracts/science-v5/contract-cases.json";
import {
  MAX_FORWARD_BODIES,
  MAX_FORWARD_SAMPLES,
  MAX_FORWARD_WALL_TIME_SECONDS,
  MAX_INTEGRATOR_STEPS,
  MAX_RHS_EVALUATIONS,
  MIN_RELATIVE_TOLERANCE,
  SCIENCE_SCHEMA_VERSION,
  ScienceBackendClient,
  ScienceValidationError,
  assertScienceJobRequest,
  assertScienceJobResult,
  assertScientificScenarioV5,
  type CapabilityManifest,
  type ForwardRunRequest,
  type RunManifest,
  type ScienceFetch,
  type ScienceJobStatus,
  type ScientificScenarioV5,
} from "../../src/science";

const G = 6.6743e-11;
const starMass = 1.98847e30;
const planetMass = 5.9722e24;
const separationM = 1.495978707e11;
const totalMass = starMass + planetMass;
const relativeSpeedMps = Math.sqrt((G * totalMass) / separationM);

const scenario: ScientificScenarioV5 = {
  schemaVersion: SCIENCE_SCHEMA_VERSION,
  id: "two-body-si",
  epochJdTdb: 2_461_236.5,
  timeScale: "TDB",
  bodies: [
    {
      id: "star",
      kind: "star",
      massKg: starMass,
      radiusM: 6.957e8,
      state: {
        positionM: [-(planetMass / totalMass) * separationM, 0, 0],
        velocityMps: [0, -(planetMass / totalMass) * relativeSpeedMps, 0],
      },
    },
    {
      id: "planet",
      kind: "planet",
      massKg: planetMass,
      radiusM: 6.371e6,
      state: {
        positionM: [(starMass / totalMass) * separationM, 0, 0],
        velocityMps: [0, (starMass / totalMass) * relativeSpeedMps, 0],
      },
    },
  ],
  observer: { lineOfSight: [0, 0, 1], targetBodyId: "star", distanceM: 3.085677581e17 },
  integrator: {
    method: "DOP853",
    positionToleranceM: 1e-3,
    velocityToleranceMps: 1e-6,
    relativeTolerance: 1e-12,
    maxStepSec: 3600,
  },
};

const forwardRequest: ForwardRunRequest = {
  kind: "forward",
  scenario,
  startOffsetSec: 0,
  endOffsetSec: 86400,
  sampleCadenceSec: 60,
  outputs: ["radial-velocity"],
  seed: 42,
};

const queuedJob: ScienceJobStatus = {
  id: "job-1",
  kind: "forward",
  state: "queued",
  submittedAt: "2026-07-15T00:00:00.000Z",
  updatedAt: "2026-07-15T00:00:00.000Z",
  progress: 0,
};

const capabilityManifest: CapabilityManifest = {
  schemaVersion: SCIENCE_SCHEMA_VERSION,
  serviceVersion: "0.2.0-alpha.1",
  generatedAt: "2026-07-15T00:00:00.000Z",
  supportedJobKinds: ["forward"],
  supportedOutputs: ["radial-velocity"],
  supportedSamplers: [],
  unavailableModelIds: ["v4.educational-halo"],
};

const runManifest: RunManifest = {
  schemaVersion: SCIENCE_SCHEMA_VERSION,
  runId: "job-1",
  inputHashSha256: "a".repeat(64),
  scientificResult: true,
  softwareVersions: {
    backend: "0.2.0-alpha.1",
    engine: "SciPy 1.18.0 DOP853",
    python: "3.12.0",
    scipy: "1.18.0",
    pyarrow: "25.0.0",
  },
  gravitationalConstantM3KgS2: G,
  epochJdTdb: scenario.epochJdTdb,
  startedAt: "2026-07-15T00:00:00.000Z",
  completedAt: "2026-07-15T00:00:01.000Z",
  capabilityManifestVersion: "0.2.0-alpha.1",
  modelVersions: [{ id: "dynamics", version: "newtonian-point-mass-finite-radius-boundary-v2" }],
  numericalTolerances: {
    requestedPositionToleranceM: 1e-3,
    effectivePositionToleranceM: 1e-3,
    requestedVelocityToleranceMps: 1e-6,
    effectiveVelocityToleranceMps: 1e-6,
    requestedRelativeTolerance: 1e-12,
    effectiveRelativeTolerance: 1e-12,
    requestedMaxStepSec: 3600,
    effectiveMaxStepSec: 3600,
  },
  datasets: [],
  validityDomain: ["Newtonian finite-radius contact boundary"],
  warnings: [],
  randomSeed: 42,
};

const json = (payload: unknown, status = 200): Response =>
  new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } });

describe("V5 scientific contract", () => {
  it("matches the shared V5 contract fixture and enforces its forward-body bound", () => {
    expect(MAX_FORWARD_BODIES).toBe(contractCases.limits.maxForwardBodies);
    expect(MAX_FORWARD_SAMPLES).toBe(contractCases.limits.maxForwardSamples);
    expect(MAX_INTEGRATOR_STEPS).toBe(contractCases.limits.maxIntegratorSteps);
    expect(MAX_RHS_EVALUATIONS).toBe(contractCases.limits.maxRhsEvaluations);
    expect(MAX_FORWARD_WALL_TIME_SECONDS).toBe(contractCases.limits.maxWallTimeSeconds);
    expect(() => assertScienceJobRequest(contractCases.validForwardRequest)).not.toThrow();
    expect(() => assertScienceJobResult(contractCases.validForwardResult)).not.toThrow();

    const oversizedRequest = {
      ...contractCases.validForwardRequest,
      scenario: {
        ...contractCases.validForwardRequest.scenario,
        bodies: [
          ...contractCases.validForwardRequest.scenario.bodies,
          ...contractCases.tooManyBodiesCase.additionalBodies,
        ],
      },
    };
    try {
      assertScienceJobRequest(oversizedRequest);
      throw new Error("Expected the shared oversized forward request to be rejected.");
    } catch (error) {
      expect(error).toBeInstanceOf(ScienceValidationError);
      expect(String(error)).toContain(contractCases.tooManyBodiesCase.expected.path);
      expect(String(error)).toContain(contractCases.tooManyBodiesCase.expected.messageIncludes);
    }
  });

  it("accepts a complete SI barycentric scenario and forward request", () => {
    expect(() => assertScientificScenarioV5(scenario)).not.toThrow();
    expect(() => assertScienceJobRequest(forwardRequest)).not.toThrow();
  });

  it("rejects unknown fields, non-unit observer vectors, and V4-like requests", () => {
    expect(() => assertScientificScenarioV5({ ...scenario, extra: true })).toThrow(ScienceValidationError);
    expect(() => assertScientificScenarioV5({ ...scenario, observer: { lineOfSight: [0, 0, 2] } })).toThrow(
      /unit vector/,
    );
    expect(() => assertScienceJobRequest({ kind: "forward", scenario: { star: {} } })).toThrow(
      ScienceValidationError,
    );
  });

  it("rejects string epochs, missing targets, non-barycentric states, and sub-floor tolerances", () => {
    expect(() => assertScientificScenarioV5({ ...scenario, epochJdTdb: "2026-07-15" })).toThrow(/epochJdTdb/);
    expect(() => assertScientificScenarioV5({ ...scenario, observer: { lineOfSight: [0, 0, 1] } })).toThrow(
      /targetBodyId/,
    );
    const displacedBodies = scenario.bodies.map((body, index) =>
      index === 0 ? { ...body, state: { ...body.state, positionM: [1e8, 0, 0] as const } } : body,
    );
    expect(() => assertScientificScenarioV5({ ...scenario, bodies: displacedBodies })).toThrow(/barycentric/);
    expect(() =>
      assertScientificScenarioV5({
        ...scenario,
        integrator: { ...scenario.integrator, relativeTolerance: MIN_RELATIVE_TOLERANCE / 2 },
      }),
    ).toThrow(/SciPy/);
    expect(() =>
      assertScientificScenarioV5({
        ...scenario,
        integrator: { ...scenario.integrator, relativeTolerance: 1 },
      }),
    ).toThrow(/less than one/);
  });

  it.each([
    ["whitespace", "   ", false],
    ["128 ASCII code points", "a".repeat(128), true],
    ["129 ASCII code points", "a".repeat(129), false],
    ["128 combining code points", "e\u0301".repeat(64), true],
    ["130 combining code points", "e\u0301".repeat(65), false],
    ["128 emoji code points", "😀".repeat(128), true],
    ["129 emoji code points", "😀".repeat(129), false],
  ])("enforces V5 identifier bounds for scenario.id: %s", (_label, id, isValid) => {
    const candidate = { ...scenario, id };
    if (isValid) {
      expect(() => assertScientificScenarioV5(candidate)).not.toThrow();
    } else {
      expect(() => assertScientificScenarioV5(candidate)).toThrow(/scenario.id/);
    }
  });

  it.each([
    ["whitespace", "   ", false],
    ["128 ASCII code points", "a".repeat(128), true],
    ["129 ASCII code points", "a".repeat(129), false],
    ["128 combining code points", "e\u0301".repeat(64), true],
    ["130 combining code points", "e\u0301".repeat(65), false],
    ["128 emoji code points", "😀".repeat(128), true],
    ["129 emoji code points", "😀".repeat(129), false],
  ])("enforces V5 identifier bounds for body.id: %s", (_label, id, isValid) => {
    const bodies = scenario.bodies.map((body, index) => (index === 0 ? { ...body, id } : body));
    const candidate = { ...scenario, bodies, observer: { ...scenario.observer, targetBodyId: id } };
    if (isValid) {
      expect(() => assertScientificScenarioV5(candidate)).not.toThrow();
    } else {
      expect(() => assertScientificScenarioV5(candidate)).toThrow(/scenario\.bodies\[0\]\.id/);
    }
  });

  it.each([
    ["whitespace", "   ", false],
    ["128 ASCII code points", "a".repeat(128), true],
    ["129 ASCII code points", "a".repeat(129), false],
    ["128 combining code points", "e\u0301".repeat(64), true],
    ["130 combining code points", "e\u0301".repeat(65), false],
    ["128 emoji code points", "😀".repeat(128), true],
    ["129 emoji code points", "😀".repeat(129), false],
  ])("enforces V5 identifier bounds for observer.targetBodyId: %s", (_label, id, isValid) => {
    const candidate = isValid
      ? {
          ...scenario,
          bodies: scenario.bodies.map((body, index) => (index === 0 ? { ...body, id } : body)),
          observer: { ...scenario.observer, targetBodyId: id },
        }
      : { ...scenario, observer: { ...scenario.observer, targetBodyId: id } };
    if (isValid) {
      expect(() => assertScientificScenarioV5(candidate)).not.toThrow();
    } else {
      expect(() => assertScientificScenarioV5(candidate)).toThrow(/scenario.observer.targetBodyId/);
    }
  });

  it("accepts only the implemented radial-velocity HTTP output", () => {
    expect(() => assertScienceJobRequest({ ...forwardRequest, outputs: ["photometry"] })).toThrow(
      /radial-velocity/,
    );
  });

  it("rejects non-finite or oversized materialized sample grids", () => {
    expect(() =>
      assertScienceJobRequest({
        ...forwardRequest,
        endOffsetSec: Number.MAX_VALUE,
        sampleCadenceSec: 1e-300,
      }),
    ).toThrow(/forward samples/);
    expect(() =>
      assertScienceJobRequest({
        ...forwardRequest,
        endOffsetSec: MAX_FORWARD_SAMPLES + 1,
        sampleCadenceSec: 1,
      }),
    ).toThrow(String(MAX_FORWARD_SAMPLES));
    expect(() =>
      assertScienceJobRequest({
        ...forwardRequest,
        endOffsetSec: MAX_INTEGRATOR_STEPS + 1,
        sampleCadenceSec: MAX_INTEGRATOR_STEPS + 1,
        scenario: {
          ...forwardRequest.scenario,
          integrator: { ...forwardRequest.scenario.integrator, maxStepSec: 1 },
        },
      }),
    ).toThrow(String(MAX_INTEGRATOR_STEPS));
    expect(() =>
      assertScienceJobRequest({
        ...forwardRequest,
        scenario: {
          ...scenario,
          bodies: [
            ...scenario.bodies,
            {
              id: "moon",
              kind: "moon",
              massKg: 7.342e22,
              radiusM: 1.7374e6,
              state: {
                positionM: [0, 0, 2 * separationM],
                velocityMps: [0, 0, 0],
              },
            },
            {
              id: "companion",
              kind: "companion",
              massKg: 1e20,
              radiusM: 1e5,
              state: {
                positionM: [0, 0, 3 * separationM],
                velocityMps: [0, 0, 0],
              },
            },
          ],
        },
      }),
    ).toThrow(String(MAX_FORWARD_BODIES));
    expect(() =>
      assertScienceJobRequest({
        ...forwardRequest,
        startOffsetSec: 1e16,
        endOffsetSec: 1e16 + 4,
        sampleCadenceSec: 1,
      }),
    ).toThrow(/strictly increasing sample grid/);
  });

  it("rejects malformed inference priors and incomplete result provenance", () => {
    expect(() =>
      assertScienceJobRequest({
        kind: "inference",
        scenario,
        observations: [{ id: "lightcurve", kind: "photometry", datasetId: "lc-1" }],
        parameters: [{ id: "mass", prior: { distribution: "log-uniform", lower: 0, upper: 1 } }],
        sampler: "emcee",
        seed: 1,
        maxWallTimeSec: 10,
      }),
    ).toThrow(/log-uniform/);
    expect(() => assertScienceJobResult({ kind: "forward", arrowArtifactId: "artifact-1" })).toThrow(
      /runManifest/,
    );
    expect(() =>
      assertScienceJobResult({ kind: "forward", arrowArtifactId: "b".repeat(64), runManifest }),
    ).not.toThrow();
    const missingVersions: Record<string, unknown> = { ...runManifest };
    delete missingVersions.softwareVersions;
    expect(() =>
      assertScienceJobResult({
        kind: "forward",
        arrowArtifactId: "b".repeat(64),
        runManifest: missingVersions,
      }),
    ).toThrow(/softwareVersions/);
    expect(() =>
      assertScienceJobResult({ kind: "forward", arrowArtifactId: "artifact-1", runManifest }),
    ).toThrow(/lowercase SHA-256/);
    expect(() =>
      assertScienceJobResult({
        kind: "forward",
        arrowArtifactId: "b".repeat(64),
        runManifest: {
          ...runManifest,
          numericalTolerances: {
            ...runManifest.numericalTolerances,
            effectivePositionToleranceM: 2e-3,
          },
        },
      }),
    ).toThrow(/equal to requestedPositionToleranceM/);
  });
});

describe("V5 local backend client", () => {
  it("preserves the shared backend error envelopes", async () => {
    for (const envelope of contractCases.errorEnvelopes) {
      const client = new ScienceBackendClient({ fetchImpl: async () => json(envelope, envelope.status) });
      const request =
        envelope.code === "unknown-artifact"
          ? client.getResult("job-1")
          : envelope.code === "job-already-terminal"
            ? client.cancelJob("job-1")
            : client.getJob("job-1");
      await expect(request).rejects.toMatchObject({
        status: envelope.status,
        code: envelope.code,
        message: envelope.message,
      });
    }
  });

  it("accepts an honest capability manifest with no available job engine", () => {
    expect(() => assertScienceJobRequest(forwardRequest)).not.toThrow();
    const unavailable: CapabilityManifest = {
      ...capabilityManifest,
      supportedJobKinds: [],
      supportedOutputs: [],
      supportedSamplers: [],
    };
    const client = new ScienceBackendClient({ fetchImpl: async () => json(unavailable) });
    return expect(client.getCapabilities()).resolves.toEqual(unavailable);
  });

  it("uses the local API routes and validates successful responses", async () => {
    const fetchImpl = vi.fn<ScienceFetch>(async (input, init) => {
      const url = new URL(input.toString());
      if (url.pathname === "/v1/capabilities") {
        expect(init?.method).toBe("GET");
        return json(capabilityManifest);
      }
      expect(url.pathname).toBe("/v1/jobs");
      expect(init?.method).toBe("POST");
      expect(JSON.parse(String(init?.body))).toEqual(forwardRequest);
      return json(queuedJob, 201);
    });
    const client = new ScienceBackendClient({ baseUrl: "http://127.0.0.1:8765", fetchImpl });

    await expect(client.getCapabilities()).resolves.toEqual(capabilityManifest);
    await expect(client.submitJob(forwardRequest)).resolves.toEqual(queuedJob);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("does not rebind the fetch callback receiver", async () => {
    const receivers: unknown[] = [];
    const fetchImpl: ScienceFetch = function (this: unknown) {
      receivers.push(this);
      return Promise.resolve(json(capabilityManifest));
    };
    const client = new ScienceBackendClient({ fetchImpl });

    await expect(client.getCapabilities()).resolves.toEqual(capabilityManifest);
    expect(receivers).toEqual([undefined]);
  });

  it("requires a validated capability manifest before a V5 job can be submitted", async () => {
    const client = new ScienceBackendClient({ fetchImpl: async () => json(queuedJob, 201) });

    await expect(client.submitJob(forwardRequest)).rejects.toThrow(/capabilities must be fetched/);
  });

  it("fails closed for non-local URLs, server errors, malformed contracts, and pre-aborted requests", async () => {
    expect(() => new ScienceBackendClient({ baseUrl: "https://science.example.test" })).toThrow(
      /loopback host/,
    );
    expect(() => new ScienceBackendClient({ baseUrl: "http://[::1]:8765" })).toThrow(/loopback host/);
    const errorClient = new ScienceBackendClient({
      fetchImpl: async () => json({ code: "missing", message: "job not found" }, 404),
    });
    await expect(errorClient.getJob("unknown")).rejects.toMatchObject({
      status: 404,
      code: "missing",
    });
    const malformedClient = new ScienceBackendClient({ fetchImpl: async () => json({ state: "succeeded" }) });
    await expect(malformedClient.getJob("job-1")).rejects.toThrow(/invalid contract/);
    const fetchImpl = vi.fn<ScienceFetch>(async () => json(capabilityManifest));
    const abort = new AbortController();
    abort.abort();
    await expect(new ScienceBackendClient({ fetchImpl }).getCapabilities(abort.signal)).rejects.toMatchObject(
      {
        name: "AbortError",
      },
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("polls until terminal state and encodes job ids before cancellation", async () => {
    const statuses: ScienceJobStatus[] = [
      queuedJob,
      { ...queuedJob, state: "running", progress: 0.5 },
      { ...queuedJob, state: "succeeded", progress: 1 },
    ];
    const paths: string[] = [];
    const fetchImpl: ScienceFetch = async (input, init) => {
      paths.push(`${init?.method} ${new URL(input.toString()).pathname}`);
      if (init?.method === "DELETE") return json({ ...queuedJob, state: "cancelled" });
      return json(statuses.shift());
    };
    const client = new ScienceBackendClient({ fetchImpl });

    await expect(client.pollJob("job-1", { intervalMs: 0, maxAttempts: 3 })).resolves.toMatchObject({
      state: "succeeded",
    });
    await expect(client.cancelJob("job / 1")).resolves.toMatchObject({ state: "cancelled" });
    expect(paths).toContain("DELETE /v1/jobs/job%20%2F%201");
  });
});
