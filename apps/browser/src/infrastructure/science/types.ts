/**
 * Stable, browser-facing contract for the local bounded scientific backend.
 *
 * V5 state is barycentric, Cartesian and SI.  It intentionally does not
 * accept the application's educational V4 configuration shape.
 */

export const SCIENCE_SCHEMA_VERSION = "v5" as const;
/** Default reference epoch: Julian Date 2451545.0 on the TDB time scale. */
export const DEFAULT_EPOCH_JD_TDB = 2_451_545.0;
/** SciPy's solve_ivp lower bound: 100 IEEE-754 double-precision epsilons. */
export const MIN_RELATIVE_TOLERANCE = 100 * Number.EPSILON;
/** Hard local-alpha limit for one materialized forward-result table. */
export const MAX_FORWARD_SAMPLES = 100_000;
/** Hard local-alpha limit for bodies in a materialized forward integration. */
export const MAX_FORWARD_BODIES = 3;
/** Shared fail-closed limit for accepted integration steps in one direction. */
export const MAX_INTEGRATOR_STEPS = 500_000;
/** Shared fail-closed limit for right-hand-side evaluations in one run. */
export const MAX_RHS_EVALUATIONS = 8_000_000;
/** Shared elapsed-time watchdog for a foreground scientific job. */
export const MAX_FORWARD_WALL_TIME_SECONDS = 60;
export const RUN_MANIFEST_V2_SCHEMA_VERSION = "science-run-manifest-v2" as const;

export type ScientificBodyKind = "star" | "planet" | "moon" | "companion";
export type TimeScale = "TDB";
export type JobKind = "forward" | "inference";
export type JobState = "queued" | "running" | "succeeded" | "failed" | "cancelled";

export type Vector3 = readonly [number, number, number];

export type CartesianStateSI = {
  /** Barycentric position [m]. */
  positionM: Vector3;
  /** Barycentric velocity [m s^-1]. */
  velocityMps: Vector3;
};

export type ScientificBodyV5 = {
  id: string;
  kind: ScientificBodyKind;
  massKg: number;
  radiusM: number;
  state: CartesianStateSI;
};

export type ObserverGeometryV5 = {
  /** Unit vector from barycentre toward the observer. */
  lineOfSight: Vector3;
  /** Body whose barycentric line-of-sight velocity defines the RV output. */
  targetBodyId: string;
  /** Source distance [m], required for angular observables. */
  distanceM?: number;
};

export type IntegratorSettingsV5 = {
  method: "DOP853";
  /** Absolute tolerance for Cartesian position components [m]. */
  positionToleranceM: number;
  /** Absolute tolerance for Cartesian velocity components [m s^-1]. */
  velocityToleranceMps: number;
  relativeTolerance: number;
  maxStepSec: number;
};

/** Canonical scientific input.  All values use SI units unless noted. */
export type ScientificScenarioV5 = {
  schemaVersion: typeof SCIENCE_SCHEMA_VERSION;
  id: string;
  /** Initial-state epoch as a numeric Julian Date on the TDB scale. */
  epochJdTdb: number;
  timeScale: TimeScale;
  bodies: readonly ScientificBodyV5[];
  observer: ObserverGeometryV5;
  integrator: IntegratorSettingsV5;
};

/** The alpha HTTP backend intentionally advertises and accepts only this implemented output. */
export type ForwardOutput = "radial-velocity";

export type ForwardRunRequest = {
  kind: "forward";
  scenario: ScientificScenarioV5;
  startOffsetSec: number;
  endOffsetSec: number;
  sampleCadenceSec: number;
  outputs: readonly ["radial-velocity"];
  seed: number;
};

export type ObservationKind = "photometry" | "radial-velocity" | "astrometry" | "timing";

export type ObservationTableRef = {
  id: string;
  kind: ObservationKind;
  /** Local backend dataset identifier; the browser never uploads arbitrary files. */
  datasetId: string;
};

export type PriorV5 =
  | { distribution: "uniform"; lower: number; upper: number }
  | { distribution: "log-uniform"; lower: number; upper: number }
  | { distribution: "normal"; mean: number; standardDeviation: number }
  | {
      distribution: "truncated-normal";
      mean: number;
      standardDeviation: number;
      lower: number;
      upper: number;
    };

export type InferenceParameterV5 = {
  id: string;
  prior: PriorV5;
};

export type InferenceRequest = {
  kind: "inference";
  scenario: ScientificScenarioV5;
  observations: readonly ObservationTableRef[];
  parameters: readonly InferenceParameterV5[];
  sampler: "emcee" | "dynesty";
  seed: number;
  maxWallTimeSec: number;
};

export type ScienceJobRequest = ForwardRunRequest | InferenceRequest;

export type CapabilityManifest = {
  schemaVersion: typeof SCIENCE_SCHEMA_VERSION;
  serviceVersion: string;
  generatedAt: string;
  supportedJobKinds: readonly JobKind[];
  supportedOutputs: readonly ForwardOutput[];
  supportedSamplers: readonly InferenceRequest["sampler"][];
  unavailableModelIds: readonly string[];
};

type RunManifestCommon = {
  runId: string;
  inputHashSha256: string;
  scientificResult: true;
  /** CODATA 2022 G [m^3 kg^-1 s^-2] used by the propagated equations. */
  gravitationalConstantM3KgS2: number;
  /** Exact input epoch, round-tripped for provenance. */
  epochJdTdb: number;
  startedAt: string;
  completedAt: string;
  capabilityManifestVersion: string;
  modelVersions: readonly { id: string; version: string }[];
  numericalTolerances: Readonly<{
    requestedPositionToleranceM: number;
    effectivePositionToleranceM: number;
    requestedVelocityToleranceMps: number;
    effectiveVelocityToleranceMps: number;
    requestedRelativeTolerance: number;
    effectiveRelativeTolerance: number;
    requestedMaxStepSec: number;
    effectiveMaxStepSec: number;
  }>;
  datasets: readonly { id: string; version: string; sha256: string }[];
  validityDomain: readonly string[];
  warnings: readonly string[];
  randomSeed: number;
};

/** Compatibility shape emitted before engine-neutral provenance was introduced. */
export type RunManifestV1 = RunManifestCommon & {
  schemaVersion: typeof SCIENCE_SCHEMA_VERSION;
  softwareVersions: Readonly<{
    backend: string;
    engine: string;
    python: string;
    scipy: string;
    pyarrow: string;
  }>;
};

export type RunManifestV2 = RunManifestCommon & {
  schemaVersion: typeof RUN_MANIFEST_V2_SCHEMA_VERSION;
  implementation: Readonly<{
    application: Readonly<{ name: string; version: string; build: string }>;
    engine: Readonly<{
      kind: "python-scipy" | "swift-native";
      name: string;
      version: string;
    }>;
    runtime: Readonly<{ name: string; version: string }>;
    artifactWriter: Readonly<{ name: string; version: string }>;
    platform: Readonly<{ os: string; architecture: string }>;
  }>;
  artifact: Readonly<{
    idSha256: string;
    format: "arrow-ipc-file";
    schemaVersion: "radial-velocity-v1";
    rowCount: number;
  }>;
};

/** Readers accept V1 for existing artifacts; all new writers emit V2. */
export type RunManifest = RunManifestV1 | RunManifestV2;

export type ScienceJobStatus = {
  id: string;
  kind: JobKind;
  state: JobState;
  submittedAt: string;
  updatedAt: string;
  progress: number;
  error?: { code: string; message: string };
};

export type ForwardRunResult = {
  kind: "forward";
  runManifest: RunManifest;
  /** Immutable local Arrow IPC artifact. */
  arrowArtifactId: string;
};

export type PosteriorResult = {
  kind: "inference";
  runManifest: RunManifest;
  /** Immutable local Arrow IPC artifact containing weighted posterior samples. */
  arrowArtifactId: string;
  logEvidence?: number;
};

export type ScienceJobResult = ForwardRunResult | PosteriorResult;
