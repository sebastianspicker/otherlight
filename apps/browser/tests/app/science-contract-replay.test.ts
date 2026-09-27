/** Verifies the deterministic, display-safe V5 contract fixture adapter. */
import { describe, expect, it } from "vitest";
import { getScienceContractReplay } from "../../src/presentation/controllers/scienceContractReplay";

describe("science contract replay", () => {
  it("validates and projects the shared forward-result fixture without an execution claim", () => {
    const replay = getScienceContractReplay();

    expect(replay).toEqual({
      source: "contracts/science-v5/contract-cases.json#validForwardResult",
      label: "Fixture replay only",
      execution: "No V5 execution",
      runClassification: "Not a completed local or scientific run",
      resultKind: "forward",
      fixtureRunId: "job-shared-fixture",
      inputHashSha256: "a".repeat(64),
      implementation: "otherlight-science-backend 0.2.0-alpha.1",
      modelVersion: "newtonian-point-mass-finite-radius-boundary-v2",
      artifactFormat: "arrow-ipc-file",
      artifactRowCount: 1441,
    });
    expect(JSON.stringify(replay)).not.toContain("scientificResult");
    expect(JSON.stringify(replay)).not.toContain("arrowArtifactId");
  });
});
