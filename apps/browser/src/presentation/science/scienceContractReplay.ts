/** Provides a deterministic, display-only replay of the shared V5 contract fixture. */
import contractCases from "../../../../../contracts/science-v5/contract-cases.json";
import {
  assertScienceJobResult,
  RUN_MANIFEST_V2_SCHEMA_VERSION,
  type ScienceJobResult,
} from "../../infrastructure/science";

export type ScienceContractReplay = {
  source: "contracts/science-v5/contract-cases.json#validForwardResult";
  label: "Fixture replay only";
  execution: "No V5 execution";
  runClassification: "Not a completed local or scientific run";
  resultKind: ScienceJobResult["kind"];
  fixtureRunId: string;
  inputHashSha256: string;
  implementation: string;
  modelVersion: string;
  artifactFormat: string;
  artifactRowCount: number;
};

function validForwardResult(): ScienceJobResult {
  const result: unknown = contractCases.validForwardResult;
  assertScienceJobResult(result);
  return result;
}

export function getScienceContractReplay(): ScienceContractReplay {
  const result = validForwardResult();
  const { runManifest } = result;
  if (runManifest.schemaVersion !== RUN_MANIFEST_V2_SCHEMA_VERSION) {
    throw new Error("The scientific contract replay requires a V2 run manifest.");
  }
  const dynamicsModel = runManifest.modelVersions.find(({ id }) => id === "dynamics");

  return {
    source: "contracts/science-v5/contract-cases.json#validForwardResult",
    label: "Fixture replay only",
    execution: "No V5 execution",
    runClassification: "Not a completed local or scientific run",
    resultKind: result.kind,
    fixtureRunId: runManifest.runId,
    inputHashSha256: runManifest.inputHashSha256,
    implementation: `${runManifest.implementation.application.name} ${runManifest.implementation.application.version}`,
    modelVersion: dynamicsModel?.version ?? "No dynamics model version recorded",
    artifactFormat: runManifest.artifact.format,
    artifactRowCount: runManifest.artifact.rowCount,
  };
}
