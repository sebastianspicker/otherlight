// @vitest-environment jsdom
/** Verifies science workspace contracts across app startup, controls, and runtime integration. */

import { describe, expect, it, vi } from "vitest";

import { getPresetById } from "../../src/app/presets";
import { wireScienceWorkspace } from "../../src/app/scienceWorkspace";
import type {
  CapabilityManifest,
  ForwardRunRequest,
  ScienceJobResult,
  ScienceJobStatus,
} from "../../src/science";
import { renderScientificWorkspace } from "../../src/ui/templates/scientificWorkspace";

const CAPABILITIES: CapabilityManifest = {
  schemaVersion: "v5",
  serviceVersion: "0.2.0-alpha.1",
  generatedAt: "2026-07-15T12:00:00Z",
  supportedJobKinds: ["forward"],
  supportedOutputs: ["radial-velocity"],
  supportedSamplers: [],
  unavailableModelIds: ["photometry", "timing", "inference"],
};

function jobStatus(state: ScienceJobStatus["state"]): ScienceJobStatus {
  return {
    id: "job-1",
    kind: "forward",
    state,
    submittedAt: "2026-07-15T12:00:00Z",
    updatedAt: "2026-07-15T12:00:01Z",
    progress: state === "succeeded" ? 1 : 0,
  };
}

const RESULT: ScienceJobResult = {
  kind: "forward",
  arrowArtifactId: "b".repeat(64),
  runManifest: {
    schemaVersion: "v5",
    runId: "run-1",
    inputHashSha256: "a".repeat(64),
    scientificResult: true,
    softwareVersions: {
      backend: "0.2.0-alpha.1",
      engine: "newtonian-point-mass",
      python: "3.12",
      scipy: "1.18.0",
      pyarrow: "25.0.0",
    },
    gravitationalConstantM3KgS2: 6.6743e-11,
    epochJdTdb: 2_451_545,
    startedAt: "2026-07-15T12:00:00Z",
    completedAt: "2026-07-15T12:00:01Z",
    capabilityManifestVersion: "0.2.0-alpha.1",
    modelVersions: [{ id: "newtonian-point-mass", version: "1" }],
    numericalTolerances: {
      requestedPositionToleranceM: 1e-3,
      effectivePositionToleranceM: 1e-3,
      requestedVelocityToleranceMps: 1e-6,
      effectiveVelocityToleranceMps: 1e-6,
      requestedRelativeTolerance: 1e-11,
      effectiveRelativeTolerance: 1e-11,
      requestedMaxStepSec: 3_600,
      effectiveMaxStepSec: 3_600,
    },
    datasets: [],
    validityDomain: ["non-colliding Newtonian point masses"],
    warnings: [],
    randomSeed: 42,
  },
};

function installWorkspace(): void {
  const documentFragment = new DOMParser().parseFromString(renderScientificWorkspace(), "text/html");
  document.body.replaceChildren(...Array.from(documentFragment.body.childNodes));
}

describe("scientific workspace", () => {
  it("enables and submits only after the backend advertises the alpha contract", async () => {
    installWorkspace();
    const submitJob = vi.fn(async (_request: ForwardRunRequest) => jobStatus("queued"));
    const controller = new AbortController();
    const client = {
      getCapabilities: vi.fn(async () => CAPABILITIES),
      submitJob,
      pollJob: vi.fn(async () => jobStatus("succeeded")),
      getResult: vi.fn(async () => RESULT),
      cancelJob: vi.fn(async () => jobStatus("cancelled")),
    };
    const workspace = wireScienceWorkspace({
      getSystem: () => getPresetById("default").params,
      isBinaryMode: () => false,
      signal: controller.signal,
      client,
    });

    await workspace.refreshCapabilities();
    const runButton = document.getElementById("scienceRunBtn") as HTMLButtonElement;
    expect(runButton.disabled).toBe(false);
    runButton.click();

    await vi.waitFor(() =>
      expect(document.getElementById("scienceResult")?.textContent).toContain('"runId": "run-1"'),
    );
    const request = submitJob.mock.calls[0][0];
    expect(request.outputs).toEqual(["radial-velocity"]);
    expect(request.scenario.timeScale).toBe("TDB");
    expect(request.scenario.bodies.map((body) => body.id)).toEqual(["star", "planet", "moon"]);
    expect((document.getElementById("scienceArtifactLink") as HTMLAnchorElement).href).toContain(
      `/v1/artifacts/${RESULT.arrowArtifactId}`,
    );
    controller.abort();
  });

  it("stays fail-closed when the required output is not advertised", async () => {
    installWorkspace();
    const controller = new AbortController();
    const workspace = wireScienceWorkspace({
      getSystem: () => getPresetById("default").params,
      isBinaryMode: () => false,
      signal: controller.signal,
      client: {
        getCapabilities: vi.fn(async () => ({ ...CAPABILITIES, supportedOutputs: [] })),
        submitJob: vi.fn(async () => jobStatus("queued")),
        pollJob: vi.fn(async () => jobStatus("succeeded")),
        getResult: vi.fn(async () => RESULT),
        cancelJob: vi.fn(async () => jobStatus("cancelled")),
      },
    });

    await workspace.refreshCapabilities();

    expect((document.getElementById("scienceRunBtn") as HTMLButtonElement).disabled).toBe(true);
    expect(document.getElementById("scienceCapabilityStatus")?.textContent).toContain("unavailable");
    controller.abort();
  });

  it("retains a timed-out job so the user can still cancel it", async () => {
    installWorkspace();
    const controller = new AbortController();
    const cancelJob = vi.fn(async () => jobStatus("cancelled"));
    const workspace = wireScienceWorkspace({
      getSystem: () => getPresetById("default").params,
      isBinaryMode: () => false,
      signal: controller.signal,
      client: {
        getCapabilities: vi.fn(async () => CAPABILITIES),
        submitJob: vi.fn(async (_request: ForwardRunRequest) => jobStatus("queued")),
        pollJob: vi.fn(async () => {
          throw new Error("polling window elapsed");
        }),
        getResult: vi.fn(async () => RESULT),
        cancelJob,
      },
    });
    await workspace.refreshCapabilities();

    (document.getElementById("scienceRunBtn") as HTMLButtonElement).click();
    await vi.waitFor(() =>
      expect(document.getElementById("scienceRunStatus")?.textContent).toContain("polling window elapsed"),
    );
    const cancelButton = document.getElementById("scienceCancelBtn") as HTMLButtonElement;
    expect(cancelButton.disabled).toBe(false);
    cancelButton.click();
    await vi.waitFor(() => expect(cancelJob).toHaveBeenCalledWith("job-1", controller.signal));
    await vi.waitFor(() =>
      expect(document.getElementById("scienceRunStatus")?.textContent).toContain("cancelled"),
    );
    controller.abort();
  });
});
