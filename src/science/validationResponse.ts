/** Validates scientific job lifecycle statuses and terminal result payloads. */
import {
  RUN_MANIFEST_V2_SCHEMA_VERSION,
  type JobKind,
  type JobState,
  type ScienceJobResult,
  type ScienceJobStatus,
} from "./types";
import { assertRunManifest } from "./validationManifest";
import {
  assertEnum,
  assertExactKeys,
  assertFinite,
  assertNonNegative,
  assertRecord,
  assertString,
  assertTimestamp,
  fail,
  type UnknownRecord,
} from "./validationPrimitives";

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
  if (kind === "inference" && result.logEvidence !== undefined) {
    assertFinite(result.logEvidence, "result.logEvidence");
  }
}
