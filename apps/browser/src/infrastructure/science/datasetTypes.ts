/** Strict browser-facing types for the additive V6 dataset-only service family. */

export const SCIENCE_DATASET_CAPABILITIES_SCHEMA_VERSION = "science-v6" as const;
export const SCIENCE_DATASET_DESCRIPTOR_SCHEMA_VERSION = "science-dataset-descriptor-v2" as const;
export const SCIENCE_DATASET_MEDIA_TYPE =
  "application/vnd.otherlight.science-dataset+json; charset=utf-8" as const;

/** The client refuses to upload a source larger than the service's hard admission limit. */
export const MAX_SCIENCE_DATASET_SOURCE_BYTES = 8 * 1024 * 1024;
/** Descriptors never represent more normalized samples than the V6 contract permits. */
export const MAX_SCIENCE_DATASET_SAMPLES = 100_000;
export const MAX_SCIENCE_DATASETS = 16;
export const MAX_SCIENCE_DATASET_AGGREGATE_SAMPLES = 400_000;
export const MAX_SCIENCE_DATASET_NORMALIZED_BYTES = 64 * 1024 * 1024;
/** A response is always metadata, never a dataset payload. */
export const MAX_SCIENCE_DATASET_RESPONSE_BYTES = 1024 * 1024;

export const SCIENCE_DATASET_KINDS = [
  "passband-response",
  "stellar-intensity-grid",
  "atmospheric-profile",
  "scattering-phase-function",
  "stellar-variability-psd",
] as const;

type ScienceDatasetKind = (typeof SCIENCE_DATASET_KINDS)[number];

export type ScienceDatasetDescriptor = Readonly<{
  schemaVersion: typeof SCIENCE_DATASET_DESCRIPTOR_SCHEMA_VERSION;
  id: string;
  kind: ScienceDatasetKind;
  sampleCount: number;
  mediaType: typeof SCIENCE_DATASET_MEDIA_TYPE;
  sourceByteSha256: string;
  contentSha256: string;
}>;

export type ScienceDatasetCapabilities = Readonly<{
  schemaVersion: typeof SCIENCE_DATASET_CAPABILITIES_SCHEMA_VERSION;
  /** V6 is explicitly dataset-only. An advertised V2 job is a contract violation. */
  supportedJobKinds: readonly [];
  datasetImports: Readonly<{
    mediaType: typeof SCIENCE_DATASET_MEDIA_TYPE;
    kinds: readonly ScienceDatasetKind[];
    limits: Readonly<{
      maxSourceBytes: number;
      maxDatasets: number;
      maxSamplesPerDataset: number;
      maxAggregateSamples: number;
      maxNormalizedBytes: number;
    }>;
    persistence: "process-memory";
  }>;
}>;

export type ScienceDatasetList = Readonly<{ datasets: readonly ScienceDatasetDescriptor[] }>;
