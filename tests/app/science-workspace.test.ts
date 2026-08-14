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

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
} {
  let resolve: (value: T) => void = () => undefined;
  let reject: (reason: unknown) => void = () => undefined;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function installWorkspace(): void {
  const documentFragment = new DOMParser().parseFromString(renderScientificWorkspace(), "text/html");
  document.body.replaceChildren(...Array.from(documentFragment.body.childNodes));
}

describe("scientific workspace", () => {
  it("enables and submits only after the backend advertises the alpha contract", async () => {
    installWorkspace();
    const submitJob = vi.fn(async (_request: ForwardRunRequest) => jobStatus("queued"));
    const pollJob = vi.fn(async () => jobStatus("succeeded"));
    const controller = new AbortController();
    const client = {
      getCapabilities: vi.fn(async () => CAPABILITIES),
      submitJob,
      pollJob,
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
    expect(pollJob).toHaveBeenCalledWith("job-1", {
      signal: expect.any(AbortSignal),
      intervalMs: 250,
      maxAttempts: 240,
    });
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

  it.each([
    {
      label: "nonfinite duration",
      inputId: "scienceDurationHours",
      value: "",
      message: "Duration must be a finite between 0.01 and 8760.",
    },
    {
      label: "out-of-range duration",
      inputId: "scienceDurationHours",
      value: "0",
      message: "Duration must be a finite between 0.01 and 8760.",
    },
    {
      label: "out-of-range cadence",
      inputId: "scienceCadenceSec",
      value: "31557601",
      message: "Cadence must be a finite between 0.001 and 31557600.",
    },
    {
      label: "non-integer seed",
      inputId: "scienceSeed",
      value: "1.5",
      message: `Seed must be a finite integer between ${Number.MIN_SAFE_INTEGER} and ${Number.MAX_SAFE_INTEGER}.`,
    },
  ])("reports invalid $label before submitting a job", async ({ inputId, value, message }) => {
    installWorkspace();
    const controller = new AbortController();
    const submitJob = vi.fn(async (_request: ForwardRunRequest) => jobStatus("queued"));
    const workspace = wireScienceWorkspace({
      getSystem: () => getPresetById("default").params,
      isBinaryMode: () => false,
      signal: controller.signal,
      client: {
        getCapabilities: vi.fn(async () => CAPABILITIES),
        submitJob,
        pollJob: vi.fn(async () => jobStatus("succeeded")),
        getResult: vi.fn(async () => RESULT),
        cancelJob: vi.fn(async () => jobStatus("cancelled")),
      },
    });
    await workspace.refreshCapabilities();
    (document.getElementById(inputId) as HTMLInputElement).value = value;

    (document.getElementById("scienceRunBtn") as HTMLButtonElement).click();

    await vi.waitFor(() =>
      expect(document.getElementById("scienceRunStatus")?.textContent).toContain(message),
    );
    expect(submitJob).not.toHaveBeenCalled();
    expect((document.getElementById("scienceArtifactLink") as HTMLAnchorElement).hidden).toBe(true);
    controller.abort();
  });

  it("keeps the newer capability request active after a superseded request settles", async () => {
    installWorkspace();
    const controller = new AbortController();
    const first = deferred<CapabilityManifest>();
    const second = deferred<CapabilityManifest>();
    const signals: AbortSignal[] = [];
    const getCapabilities = vi.fn((signal?: AbortSignal) => {
      signals.push(signal as AbortSignal);
      return signals.length === 1 ? first.promise : second.promise;
    });
    const workspace = wireScienceWorkspace({
      getSystem: () => getPresetById("default").params,
      isBinaryMode: () => false,
      signal: controller.signal,
      client: {
        getCapabilities,
        submitJob: vi.fn(async () => jobStatus("queued")),
        pollJob: vi.fn(async () => jobStatus("succeeded")),
        getResult: vi.fn(async () => RESULT),
        cancelJob: vi.fn(async () => jobStatus("cancelled")),
      },
    });

    const firstRefresh = workspace.refreshCapabilities();
    const secondRefresh = workspace.refreshCapabilities();
    expect(signals).toHaveLength(2);
    expect(signals[0].aborted).toBe(true);
    expect(signals[1].aborted).toBe(false);

    first.reject(new Error("stale capability failure"));
    await firstRefresh;
    expect((document.getElementById("scienceRunBtn") as HTMLButtonElement).disabled).toBe(true);
    expect(document.getElementById("scienceCapabilityStatus")?.textContent).toBe("Checking…");
    expect(document.getElementById("scienceRunStatus")?.textContent).toBe(
      "Validating the loopback V5 capability manifest.",
    );

    second.resolve(CAPABILITIES);
    await secondRefresh;
    expect((document.getElementById("scienceRunBtn") as HTMLButtonElement).disabled).toBe(false);
    controller.abort();
  });

  it("reports cancellation when the current capability request is aborted", async () => {
    installWorkspace();
    const controller = new AbortController();
    const capabilityRequest = deferred<CapabilityManifest>();
    let capabilitySignal: AbortSignal | undefined;
    const workspace = wireScienceWorkspace({
      getSystem: () => getPresetById("default").params,
      isBinaryMode: () => false,
      signal: controller.signal,
      client: {
        getCapabilities: vi.fn((signal?: AbortSignal) => {
          capabilitySignal = signal;
          signal?.addEventListener(
            "abort",
            () =>
              capabilityRequest.reject(
                new DOMException("The scientific request was cancelled.", "AbortError"),
              ),
            { once: true },
          );
          return capabilityRequest.promise;
        }),
        submitJob: vi.fn(async () => jobStatus("queued")),
        pollJob: vi.fn(async () => jobStatus("succeeded")),
        getResult: vi.fn(async () => RESULT),
        cancelJob: vi.fn(async () => jobStatus("cancelled")),
      },
    });

    const refresh = workspace.refreshCapabilities();
    expect(capabilitySignal?.aborted).toBe(false);
    const cancel = workspace.cancelCurrentJob();
    expect(capabilitySignal?.aborted).toBe(true);
    await Promise.all([refresh, cancel]);

    expect(document.getElementById("scienceCapabilityStatus")?.textContent).toBe("Unavailable");
    expect(document.getElementById("scienceRunStatus")?.textContent).toBe(
      "Backend check failed: The scientific request was cancelled.",
    );
    expect((document.getElementById("scienceRunBtn") as HTMLButtonElement).disabled).toBe(true);
    expect((document.getElementById("scienceCancelBtn") as HTMLButtonElement).disabled).toBe(true);
    controller.abort();
  });

  it("ignores a superseded capability response that settles after the newer request", async () => {
    installWorkspace();
    const controller = new AbortController();
    const first = deferred<CapabilityManifest>();
    const second = deferred<CapabilityManifest>();
    const getCapabilities = vi
      .fn<(signal?: AbortSignal) => Promise<CapabilityManifest>>()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const workspace = wireScienceWorkspace({
      getSystem: () => getPresetById("default").params,
      isBinaryMode: () => false,
      signal: controller.signal,
      client: {
        getCapabilities,
        submitJob: vi.fn(async () => jobStatus("queued")),
        pollJob: vi.fn(async () => jobStatus("succeeded")),
        getResult: vi.fn(async () => RESULT),
        cancelJob: vi.fn(async () => jobStatus("cancelled")),
      },
    });

    const firstRefresh = workspace.refreshCapabilities();
    const secondRefresh = workspace.refreshCapabilities();
    second.resolve(CAPABILITIES);
    await secondRefresh;
    expect((document.getElementById("scienceRunBtn") as HTMLButtonElement).disabled).toBe(false);
    expect(document.getElementById("scienceCapabilityStatus")?.textContent).toBe("Available (0.2.0-alpha.1)");

    first.resolve({ ...CAPABILITIES, supportedOutputs: [] });
    await firstRefresh;
    expect((document.getElementById("scienceRunBtn") as HTMLButtonElement).disabled).toBe(false);
    expect(document.getElementById("scienceCapabilityStatus")?.textContent).toBe("Available (0.2.0-alpha.1)");
    controller.abort();
  });

  it("clears a terminal error job without fetching a result", async () => {
    installWorkspace();
    const controller = new AbortController();
    const getResult = vi.fn(async () => RESULT);
    const workspace = wireScienceWorkspace({
      getSystem: () => getPresetById("default").params,
      isBinaryMode: () => false,
      signal: controller.signal,
      client: {
        getCapabilities: vi.fn(async () => CAPABILITIES),
        submitJob: vi.fn(async () => jobStatus("queued")),
        pollJob: vi.fn(async () => ({
          ...jobStatus("failed"),
          error: { code: "rejected", message: "invalid state" },
        })),
        getResult,
        cancelJob: vi.fn(async () => jobStatus("cancelled")),
      },
    });
    await workspace.refreshCapabilities();

    (document.getElementById("scienceRunBtn") as HTMLButtonElement).click();

    await vi.waitFor(() =>
      expect(document.getElementById("scienceRunStatus")?.textContent).toContain("invalid state"),
    );
    expect(getResult).not.toHaveBeenCalled();
    expect((document.getElementById("scienceCancelBtn") as HTMLButtonElement).disabled).toBe(true);
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
