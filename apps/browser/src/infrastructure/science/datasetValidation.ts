/** Validates untrusted V6 dataset metadata without accepting job-shaped payloads. */
import {
  assertArray,
  assertEnum,
  assertExactKeys,
  assertInteger,
  assertRecord,
  assertString,
  assertUniqueStrings,
  fail,
} from "./validationPrimitives";
import {
  MAX_SCIENCE_DATASET_AGGREGATE_SAMPLES,
  MAX_SCIENCE_DATASET_NORMALIZED_BYTES,
  MAX_SCIENCE_DATASET_SAMPLES,
  MAX_SCIENCE_DATASET_SOURCE_BYTES,
  MAX_SCIENCE_DATASETS,
  SCIENCE_DATASET_CAPABILITIES_SCHEMA_VERSION,
  SCIENCE_DATASET_DESCRIPTOR_SCHEMA_VERSION,
  SCIENCE_DATASET_KINDS,
  SCIENCE_DATASET_MEDIA_TYPE,
  type ScienceDatasetCapabilities,
  type ScienceDatasetDescriptor,
  type ScienceDatasetList,
} from "./datasetTypes";

const SHA256_PATTERN = /^[0-9a-f]{64}$/;

export function assertScienceDatasetDescriptor(value: unknown): asserts value is ScienceDatasetDescriptor {
  const descriptor = assertRecord(value, "dataset descriptor");
  assertExactKeys(descriptor, "dataset descriptor", [
    "schemaVersion",
    "id",
    "kind",
    "sampleCount",
    "mediaType",
    "sourceByteSha256",
    "contentSha256",
  ]);
  if (descriptor.schemaVersion !== SCIENCE_DATASET_DESCRIPTOR_SCHEMA_VERSION) {
    fail("dataset descriptor.schemaVersion", `'${SCIENCE_DATASET_DESCRIPTOR_SCHEMA_VERSION}'`);
  }
  const contentSha256 = assertSha256(descriptor.contentSha256, "dataset descriptor.contentSha256");
  assertSha256(descriptor.sourceByteSha256, "dataset descriptor.sourceByteSha256");
  const identifier = assertString(descriptor.id, "dataset descriptor.id");
  if (identifier !== `ds-${contentSha256}`) {
    fail("dataset descriptor.id", "the ds- prefix followed by contentSha256");
  }
  assertEnum(descriptor.kind, "dataset descriptor.kind", SCIENCE_DATASET_KINDS);
  assertBoundedInteger(descriptor.sampleCount, "dataset descriptor.sampleCount", MAX_SCIENCE_DATASET_SAMPLES);
  if (descriptor.mediaType !== SCIENCE_DATASET_MEDIA_TYPE) {
    fail("dataset descriptor.mediaType", `'${SCIENCE_DATASET_MEDIA_TYPE}'`);
  }
}

export function assertScienceDatasetCapabilities(
  value: unknown,
): asserts value is ScienceDatasetCapabilities {
  const capabilities = assertRecord(value, "V6 capabilities");
  assertExactKeys(capabilities, "V6 capabilities", ["schemaVersion", "supportedJobKinds", "datasetImports"]);
  if (capabilities.schemaVersion !== SCIENCE_DATASET_CAPABILITIES_SCHEMA_VERSION) {
    fail("V6 capabilities.schemaVersion", `'${SCIENCE_DATASET_CAPABILITIES_SCHEMA_VERSION}'`);
  }
  const jobs = assertArray(capabilities.supportedJobKinds, "V6 capabilities.supportedJobKinds");
  if (jobs.length !== 0)
    fail("V6 capabilities.supportedJobKinds", "an empty array because V6 jobs are unavailable");

  const imports = assertRecord(capabilities.datasetImports, "V6 capabilities.datasetImports");
  assertExactKeys(imports, "V6 capabilities.datasetImports", ["mediaType", "kinds", "limits", "persistence"]);
  if (imports.mediaType !== SCIENCE_DATASET_MEDIA_TYPE) {
    fail("V6 capabilities.datasetImports.mediaType", `'${SCIENCE_DATASET_MEDIA_TYPE}'`);
  }
  const kinds = assertArray(imports.kinds, "V6 capabilities.datasetImports.kinds").map((kind, index) =>
    assertEnum(kind, `V6 capabilities.datasetImports.kinds[${index}]`, SCIENCE_DATASET_KINDS),
  );
  if (kinds.length === 0) fail("V6 capabilities.datasetImports.kinds", "a non-empty array");
  assertUniqueStrings(kinds, "V6 capabilities.datasetImports.kinds");

  const limits = assertRecord(imports.limits, "V6 capabilities.datasetImports.limits");
  assertExactKeys(limits, "V6 capabilities.datasetImports.limits", [
    "maxSourceBytes",
    "maxDatasets",
    "maxSamplesPerDataset",
    "maxAggregateSamples",
    "maxNormalizedBytes",
  ]);
  assertBoundedInteger(
    limits.maxSourceBytes,
    "V6 capabilities.datasetImports.limits.maxSourceBytes",
    MAX_SCIENCE_DATASET_SOURCE_BYTES,
  );
  assertBoundedInteger(
    limits.maxDatasets,
    "V6 capabilities.datasetImports.limits.maxDatasets",
    MAX_SCIENCE_DATASETS,
  );
  assertBoundedInteger(
    limits.maxSamplesPerDataset,
    "V6 capabilities.datasetImports.limits.maxSamplesPerDataset",
    MAX_SCIENCE_DATASET_SAMPLES,
  );
  assertBoundedInteger(
    limits.maxAggregateSamples,
    "V6 capabilities.datasetImports.limits.maxAggregateSamples",
    MAX_SCIENCE_DATASET_AGGREGATE_SAMPLES,
  );
  assertBoundedInteger(
    limits.maxNormalizedBytes,
    "V6 capabilities.datasetImports.limits.maxNormalizedBytes",
    MAX_SCIENCE_DATASET_NORMALIZED_BYTES,
  );
  if (imports.persistence !== "process-memory") {
    fail("V6 capabilities.datasetImports.persistence", "'process-memory'");
  }
}

export function assertScienceDatasetList(value: unknown): asserts value is ScienceDatasetList {
  const list = assertRecord(value, "dataset list");
  assertExactKeys(list, "dataset list", ["datasets"]);
  const datasets = assertArray(list.datasets, "dataset list.datasets");
  if (datasets.length > MAX_SCIENCE_DATASETS) {
    fail("dataset list.datasets", `an array with at most ${MAX_SCIENCE_DATASETS} entries`);
  }
  const identifiers: string[] = [];
  datasets.forEach((descriptor) => {
    assertScienceDatasetDescriptor(descriptor);
    identifiers.push(descriptor.id);
  });
  assertUniqueStrings(identifiers, "dataset list.datasets");
}

function assertSha256(value: unknown, path: string): string {
  const hash = assertString(value, path);
  if (!SHA256_PATTERN.test(hash)) fail(path, "a lowercase SHA-256 hash");
  return hash;
}

function assertBoundedInteger(value: unknown, path: string, maximum: number): number {
  const integer = assertInteger(value, path);
  if (integer < 1 || integer > maximum) fail(path, `an integer from 1 through ${maximum}`);
  return integer;
}
