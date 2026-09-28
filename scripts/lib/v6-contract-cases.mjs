/** Runs V6 contract validation cases. */
import { assertInvalid, assertValid } from "./contract-case-helpers.mjs";
import { applyCaseMutation } from "./json-pointer-mutation.mjs";
import { scienceV6TransitEventsArrowDescriptor } from "./v6-arrow-descriptor.mjs";

const datasetSchema = "science-v6/dataset-import-v2.schema.json";
const datasetDescriptorSchema = "science-v6/dataset-descriptor-v2.schema.json";
const jobDescriptorSchema = "science-v6/job-descriptor-v2.schema.json";
const artifactDescriptorSchema = "science-v6/artifact-descriptor-v2.schema.json";
const runManifestSchema = "science-v6/run-manifest-v3.schema.json";
const timingRequestSchema = "science-v6/transit-timing-request-v1.schema.json";
const timingResultSchema = "science-v6/transit-timing-result-v1.schema.json";

export function runV6ContractCases(corpus) {
  const get = (name) => corpus.documents.get(name);
  const cases = get("science-v6/contract-cases.json");
  runDatasetCases(corpus, cases);
  runDescriptorCases(corpus, cases);
  runTimingCases(corpus, cases);
}

function runDatasetCases(corpus, cases) {
  for (const [name, dataset] of Object.entries(cases.validImports))
    assertValid(corpus, datasetSchema, `V6 ${name} dataset import`, dataset);
  for (const [name, dataset] of Object.entries(cases.invalidImports))
    if (name !== "oversizeCase") assertInvalid(corpus, datasetSchema, `V6 ${name} dataset import`, dataset);
  const oversize = { ...cases.validImports.passbandResponse };
  oversize.wavelengthM = Array.from(
    { length: cases.invalidImports.oversizeCase.sampleCount },
    (_, index) => 4e-7 + index * 1e-12,
  );
  oversize.response = Array.from({ length: cases.invalidImports.oversizeCase.sampleCount }, () => 0.5);
  assertInvalid(corpus, datasetSchema, "V6 oversize dataset import", oversize);
  assertValid(corpus, datasetDescriptorSchema, "V6 dataset descriptor", cases.validDescriptors.dataset);
}

function runDescriptorCases(corpus, cases) {
  assertValid(corpus, jobDescriptorSchema, "V6 job descriptor", cases.validDescriptors.job);
  assertValid(corpus, artifactDescriptorSchema, "V6 artifact descriptor", cases.validDescriptors.artifact);
  assertValid(corpus, jobDescriptorSchema, "V6 failed job descriptor", cases.validDescriptors.failedJob);
  assertValid(
    corpus,
    artifactDescriptorSchema,
    "V6 transit-events artifact descriptor",
    cases.validDescriptors.transitEventsArtifact,
  );
  assertValid(corpus, runManifestSchema, "V6 run manifest", cases.validRunManifest);
}

function runTimingCases(corpus, cases) {
  assertValid(corpus, timingRequestSchema, "V6 transit timing request", cases.validTransitTimingRequest);
  assertValid(corpus, timingResultSchema, "V6 transit timing result", cases.validTransitTimingResult);
  if (
    JSON.stringify(corpus.documents.get("science-v6/transit-events-arrow-v1.json")) !==
    JSON.stringify(scienceV6TransitEventsArrowDescriptor)
  )
    throw new Error("V6 transit-events Arrow descriptor must retain its exact ordered schema.");
  for (const [name, mutation] of Object.entries(cases.invalidTransitTimingRequests))
    assertInvalid(
      corpus,
      timingRequestSchema,
      `V6 invalid transit timing request ${name}`,
      applyCaseMutation(cases[mutation.source], mutation),
    );
  runInvalidDescriptors(corpus, cases);
  runInvalidManifests(corpus, cases);
  runInvalidResults(corpus, cases);
}

function runInvalidDescriptors(corpus, cases) {
  for (const [name, mutation] of Object.entries(cases.invalidDescriptors)) {
    const schemaPath = name.startsWith("artifact") ? artifactDescriptorSchema : jobDescriptorSchema;
    assertInvalid(
      corpus,
      schemaPath,
      `V6 invalid descriptor ${name}`,
      applyCaseMutation(cases.validDescriptors[mutation.source.split(".").at(-1)], mutation),
    );
  }
}

function runInvalidManifests(corpus, cases) {
  for (const [name, mutation] of Object.entries(cases.invalidRunManifests))
    assertInvalid(
      corpus,
      runManifestSchema,
      `V6 invalid run manifest ${name}`,
      applyCaseMutation(cases[mutation.source], mutation),
    );
}

function runInvalidResults(corpus, cases) {
  for (const [name, mutation] of Object.entries(cases.invalidTransitTimingResults))
    assertInvalid(
      corpus,
      timingResultSchema,
      `V6 invalid transit timing result ${name}`,
      applyCaseMutation(cases[mutation.source], mutation),
    );
}
