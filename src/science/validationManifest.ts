/** Validates backend capabilities and versioned scientific run manifests. */
import {
  MAX_FORWARD_SAMPLES,
  MIN_RELATIVE_TOLERANCE,
  RUN_MANIFEST_V2_SCHEMA_VERSION,
  SCIENCE_SCHEMA_VERSION,
  type CapabilityManifest,
  type RunManifest,
} from "./types";
import {
  assertArray,
  assertEnum,
  assertExactKeys,
  assertInteger,
  assertPositive,
  assertRecord,
  assertString,
  assertTimestamp,
  assertUniqueStrings,
  fail,
  type UnknownRecord,
} from "./validationPrimitives";

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
  if (capabilities.schemaVersion !== SCIENCE_SCHEMA_VERSION) {
    fail("capabilities.schemaVersion", `exactly '${SCIENCE_SCHEMA_VERSION}'`);
  }
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

export function assertRunManifestHeader(manifest: UnknownRecord): void {
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
  if (!/^[a-f0-9]{64}$/.test(hash)) {
    fail("runManifest.inputHashSha256", "a lowercase SHA-256 hexadecimal digest");
  }
  if (manifest.scientificResult !== true) fail("runManifest.scientificResult", "exactly true");
}

export function assertRunManifestV1Versions(manifest: UnknownRecord): void {
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
}

export function assertNamedVersion(value: unknown, path: string): void {
  const record = assertRecord(value, path);
  assertExactKeys(record, path, ["name", "version"]);
  assertString(record.name, `${path}.name`);
  assertString(record.version, `${path}.version`);
}

export function assertRunManifestV2Implementation(manifest: UnknownRecord): void {
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
  if (!/^[a-f0-9]{64}$/.test(artifactHash)) {
    fail("runManifest.artifact.idSha256", "a lowercase SHA-256 hexadecimal digest");
  }
  if (artifact.format !== "arrow-ipc-file") fail("runManifest.artifact.format", "exactly 'arrow-ipc-file'");
  if (artifact.schemaVersion !== "radial-velocity-v1") {
    fail("runManifest.artifact.schemaVersion", "exactly 'radial-velocity-v1'");
  }
  const rowCount = assertInteger(artifact.rowCount, "runManifest.artifact.rowCount");
  if (rowCount < 1 || rowCount > MAX_FORWARD_SAMPLES) {
    fail("runManifest.artifact.rowCount", `between 1 and ${MAX_FORWARD_SAMPLES}`);
  }
}

export function assertRunManifestTimingAndModels(manifest: UnknownRecord): void {
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
}

export function assertRunManifestTolerances(manifest: UnknownRecord): void {
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
}

export function assertRunManifestLists(manifest: UnknownRecord): void {
  const datasets = assertArray(manifest.datasets, "runManifest.datasets");
  const datasetIds: string[] = [];
  for (let index = 0; index < datasets.length; index++) {
    const path = `runManifest.datasets[${index}]`;
    const dataset = assertRecord(datasets[index], path);
    assertExactKeys(dataset, path, ["id", "version", "sha256"]);
    datasetIds.push(assertString(dataset.id, `${path}.id`));
    assertString(dataset.version, `${path}.version`);
    const datasetHash = assertString(dataset.sha256, `${path}.sha256`);
    if (!/^[a-f0-9]{64}$/.test(datasetHash)) {
      fail(`${path}.sha256`, "a lowercase SHA-256 hexadecimal digest");
    }
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
}

export function assertRunManifest(value: unknown): asserts value is RunManifest {
  const manifest = assertRecord(value, "runManifest");
  assertRunManifestHeader(manifest);
  if (manifest.schemaVersion === SCIENCE_SCHEMA_VERSION) {
    assertRunManifestV1Versions(manifest);
  } else {
    assertRunManifestV2Implementation(manifest);
  }
  assertRunManifestTimingAndModels(manifest);
  assertRunManifestTolerances(manifest);
  assertRunManifestLists(manifest);
}
