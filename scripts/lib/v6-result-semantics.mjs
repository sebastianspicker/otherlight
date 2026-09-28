/** Validates cross-field semantics for Science V6 transit timing results. */
import { validateScienceV6ArtifactDescriptor } from "./v6-dataset-semantics.mjs";

const object = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
const equal = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const addError = (errors, location, message) => errors.push(`${location} ${message}`);

export function validateScienceV6TransitTimingResult(value, errors) {
  if (!object(value)) return;
  const artifacts = Array.isArray(value.artifacts) ? value.artifacts : [];
  const manifestArtifacts = Array.isArray(value.runManifest?.artifacts) ? value.runManifest.artifacts : [];
  validateResultJobLink(value, errors);
  if (!equal(artifacts, manifestArtifacts))
    addError(errors, "/runManifest/artifacts", "must exactly match result artifacts");
  validateResultArtifacts(artifacts, errors);
}

function validateResultJobLink(value, errors) {
  if (
    typeof value.jobId === "string" &&
    typeof value.runManifest?.runId === "string" &&
    value.jobId !== value.runManifest.runId
  )
    addError(errors, "/jobId", "must equal runManifest.runId");
}

function validateResultArtifacts(artifacts, errors) {
  for (const [index, artifact] of artifacts.entries()) {
    validateScienceV6ArtifactDescriptor(artifact, errors, `/artifacts/${index}`);
    if (
      object(artifact) &&
      (artifact.kind !== "transit-events" || artifact.dataSchemaVersion !== "transit-events-v1")
    )
      addError(errors, `/artifacts/${index}`, "must be a transit-events-v1 artifact");
  }
}
