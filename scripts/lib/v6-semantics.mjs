/** Validates Science V6 semantic constraints by schema path. */
import {
  validateScienceV6ArtifactDescriptor,
  validateScienceV6Dataset,
  validateScienceV6DatasetDescriptor,
  validateScienceV6JobDescriptor,
  validateScienceV6RunManifest,
} from "./v6-dataset-semantics.mjs";
import { validateScienceV6TransitTimingRequest } from "./v6-transit-request-semantics.mjs";
import { validateScienceV6TransitTimingResult } from "./v6-result-semantics.mjs";

const schemas = {
  dataset: "science-v6/dataset-import-v2.schema.json",
  datasetDescriptor: "science-v6/dataset-descriptor-v2.schema.json",
  jobDescriptor: "science-v6/job-descriptor-v2.schema.json",
  artifactDescriptor: "science-v6/artifact-descriptor-v2.schema.json",
  runManifest: "science-v6/run-manifest-v3.schema.json",
  timingRequest: "science-v6/transit-timing-request-v1.schema.json",
  timingResult: "science-v6/transit-timing-result-v1.schema.json",
};

export function validateScienceV6Semantics(schemaPath, value, errors) {
  if (schemaPath === schemas.dataset) validateScienceV6Dataset(value, errors);
  if (schemaPath === schemas.datasetDescriptor) validateScienceV6DatasetDescriptor(value, errors);
  if (schemaPath === schemas.jobDescriptor) validateScienceV6JobDescriptor(value, errors);
  if (schemaPath === schemas.artifactDescriptor) validateScienceV6ArtifactDescriptor(value, errors);
  if (schemaPath === schemas.runManifest) validateScienceV6RunManifest(value, errors);
  if (schemaPath === schemas.timingRequest) validateScienceV6TransitTimingRequest(value, errors);
  if (schemaPath === schemas.timingResult) validateScienceV6TransitTimingResult(value, errors);
}
