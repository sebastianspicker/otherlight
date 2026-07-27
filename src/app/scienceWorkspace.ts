/**
 * Owns science Workspace support within the app layer. Keeps application bootstrap and frame orchestration composable.
 */
import type { SystemParams } from "../core/types";
import {
  buildScientificForwardRequestFromSystemParams,
  createScienceBackendClient,
  type CapabilityManifest,
  type ScienceJobResult,
  type ScienceJobStatus,
} from "../science";

type ScienceWorkspaceClient = Pick<
  ReturnType<typeof createScienceBackendClient>,
  "getCapabilities" | "submitJob" | "pollJob" | "getResult" | "cancelJob"
>;

type ScienceWorkspaceArgs = {
  getSystem: () => SystemParams;
  isBinaryMode: () => boolean;
  signal: AbortSignal;
  client?: ScienceWorkspaceClient;
};

export type ScienceWorkspaceController = {
  refreshCapabilities: () => Promise<void>;
  cancelCurrentJob: () => Promise<void>;
};

type ScienceWorkspaceElements = {
  capabilityStatus: HTMLElement;
  scenarioSummary: HTMLElement;
  durationHours: HTMLInputElement;
  cadenceSec: HTMLInputElement;
  seed: HTMLInputElement;
  refreshButton: HTMLButtonElement;
  runButton: HTMLButtonElement;
  cancelButton: HTMLButtonElement;
  runStatus: HTMLElement;
  artifactLink: HTMLAnchorElement;
  result: HTMLElement;
};

const SCIENCE_POLL_INTERVAL_MS = 250;
const SCIENCE_POLL_MAX_ATTEMPTS = 240;

function requiredElement<T extends Element>(id: string, constructor: { new (): T }): T {
  const element = document.getElementById(id);
  if (!(element instanceof constructor)) throw new Error(`Missing scientific workspace element #${id}.`);
  return element;
}

function getElements(): ScienceWorkspaceElements {
  return {
    capabilityStatus: requiredElement("scienceCapabilityStatus", HTMLElement),
    scenarioSummary: requiredElement("scienceScenarioSummary", HTMLElement),
    durationHours: requiredElement("scienceDurationHours", HTMLInputElement),
    cadenceSec: requiredElement("scienceCadenceSec", HTMLInputElement),
    seed: requiredElement("scienceSeed", HTMLInputElement),
    refreshButton: requiredElement("scienceRefreshBtn", HTMLButtonElement),
    runButton: requiredElement("scienceRunBtn", HTMLButtonElement),
    cancelButton: requiredElement("scienceCancelBtn", HTMLButtonElement),
    runStatus: requiredElement("scienceRunStatus", HTMLElement),
    artifactLink: requiredElement("scienceArtifactLink", HTMLAnchorElement),
    result: requiredElement("scienceResult", HTMLElement),
  };
}

function capabilitySupportsAlphaRun(capabilities: CapabilityManifest): boolean {
  return (
    capabilities.supportedJobKinds.includes("forward") &&
    capabilities.supportedOutputs.includes("radial-velocity")
  );
}

function inputNumber(
  input: HTMLInputElement,
  label: string,
  options: { minimum: number; maximum: number; integer?: boolean },
): number {
  const value = input.valueAsNumber;
  if (
    !Number.isFinite(value) ||
    value < options.minimum ||
    value > options.maximum ||
    (options.integer && !Number.isSafeInteger(value))
  ) {
    const qualifier = options.integer ? "integer " : "";
    throw new Error(
      `${label} must be a finite ${qualifier}between ${options.minimum} and ${options.maximum}.`,
    );
  }
  return value;
}

function errorMessage(error: unknown): string {
  if (error instanceof DOMException && error.name === "AbortError")
    return "The scientific request was cancelled.";
  return error instanceof Error ? error.message : String(error);
}

function renderResult(result: ScienceJobResult): string {
  return JSON.stringify(
    {
      kind: result.kind,
      arrowArtifactId: result.arrowArtifactId,
      runManifest: result.runManifest,
    },
    null,
    2,
  );
}

export function wireScienceWorkspace(args: ScienceWorkspaceArgs): ScienceWorkspaceController {
  const elements = getElements();
  const client = args.client ?? createScienceBackendClient();
  let capabilitiesReady = false;
  let currentJobId: string | null = null;
  let activeRequest: AbortController | null = null;

  const setReady = (ready: boolean): void => {
    capabilitiesReady = ready;
    elements.runButton.disabled = !ready || activeRequest !== null || currentJobId !== null;
  };
  const setBusy = (busy: boolean): void => {
    elements.refreshButton.disabled = busy;
    elements.runButton.disabled = busy || !capabilitiesReady || currentJobId !== null;
    elements.cancelButton.disabled = !busy && currentJobId === null;
  };
  const startRequest = (): AbortSignal => {
    activeRequest?.abort();
    activeRequest = new AbortController();
    setBusy(true);
    return activeRequest.signal;
  };
  const finishRequest = (signal: AbortSignal): void => {
    if (activeRequest?.signal !== signal) return;
    activeRequest = null;
    setBusy(false);
  };

  args.signal.addEventListener("abort", () => activeRequest?.abort(), { once: true });

  const refreshCapabilities = async (): Promise<void> => {
    if (args.signal.aborted) return;
    const signal = startRequest();
    setReady(false);
    elements.capabilityStatus.textContent = "Checking…";
    elements.runStatus.textContent = "Validating the loopback V5 capability manifest.";
    try {
      const capabilities = await client.getCapabilities(signal);
      const supported = capabilitySupportsAlphaRun(capabilities);
      setReady(supported);
      elements.capabilityStatus.textContent = supported
        ? `Available (${capabilities.serviceVersion})`
        : "Connected, required capability unavailable";
      elements.runStatus.textContent = supported
        ? "The backend contract is valid. The active scenario can now be submitted for validation."
        : "This backend does not advertise the alpha forward radial-velocity contract.";
    } catch (error) {
      setReady(false);
      elements.capabilityStatus.textContent = "Unavailable";
      elements.runStatus.textContent = `Backend check failed: ${errorMessage(error)}`;
    } finally {
      finishRequest(signal);
    }
  };

  const run = async (): Promise<void> => {
    if (!capabilitiesReady || args.signal.aborted) return;
    const signal = startRequest();
    elements.artifactLink.hidden = true;
    elements.artifactLink.removeAttribute("href");
    elements.result.textContent = "No scientific result has been accepted yet.";
    try {
      const durationHours = inputNumber(elements.durationHours, "Duration", {
        minimum: 0.01,
        maximum: 8_760,
      });
      const cadenceSec = inputNumber(elements.cadenceSec, "Cadence", {
        minimum: 0.001,
        maximum: 31_557_600,
      });
      const seed = inputNumber(elements.seed, "Seed", {
        minimum: Number.MIN_SAFE_INTEGER,
        maximum: Number.MAX_SAFE_INTEGER,
        integer: true,
      });
      const binaryMode = args.isBinaryMode();
      const request = buildScientificForwardRequestFromSystemParams({
        system: args.getSystem(),
        binaryMode,
        startOffsetSec: 0,
        endOffsetSec: durationHours * 3_600,
        sampleCadenceSec: cadenceSec,
        seed,
      });
      elements.scenarioSummary.textContent = binaryMode
        ? "Submitting the active detached-binary lab state to the V5 Newtonian validity checks."
        : "Submitting the active star/planet/moon state to the V5 Newtonian validity checks.";
      elements.runStatus.textContent = "Submitting the validated V5 request…";
      const submitted = await client.submitJob(request, signal);
      currentJobId = submitted.id;
      elements.runStatus.textContent = `Job ${submitted.id} is ${submitted.state}; waiting for a terminal state…`;
      const terminal = await client.pollJob(submitted.id, {
        signal,
        intervalMs: SCIENCE_POLL_INTERVAL_MS,
        maxAttempts: SCIENCE_POLL_MAX_ATTEMPTS,
      });
      if (terminal.state !== "succeeded") {
        currentJobId = null;
        throw new Error(terminal.error?.message ?? `V5 job ended in state '${terminal.state}'.`);
      }
      currentJobId = null;
      const result = await client.getResult(submitted.id, signal);
      elements.result.textContent = renderResult(result);
      elements.artifactLink.href = `http://127.0.0.1:8765/v1/artifacts/${encodeURIComponent(result.arrowArtifactId)}`;
      elements.artifactLink.hidden = false;
      elements.runStatus.textContent = `Scientific job ${submitted.id} completed; provenance is shown below.`;
    } catch (error) {
      elements.runStatus.textContent = `Scientific run failed: ${errorMessage(error)}`;
    } finally {
      finishRequest(signal);
    }
  };

  const cancel = async (): Promise<void> => {
    const jobId = currentJobId;
    activeRequest?.abort();
    if (!jobId || args.signal.aborted) {
      setBusy(false);
      return;
    }
    elements.runStatus.textContent = `Cancelling scientific job ${jobId}…`;
    try {
      const status: ScienceJobStatus = await client.cancelJob(jobId, args.signal);
      currentJobId = null;
      elements.runStatus.textContent = `Scientific job ${jobId} is ${status.state}.`;
    } catch (error) {
      elements.runStatus.textContent = `Cancellation failed: ${errorMessage(error)}`;
    } finally {
      setBusy(activeRequest !== null);
    }
  };

  elements.refreshButton.addEventListener("click", () => void refreshCapabilities(), { signal: args.signal });
  elements.runButton.addEventListener("click", () => void run(), { signal: args.signal });
  elements.cancelButton.addEventListener("click", () => void cancel(), { signal: args.signal });
  setReady(false);
  return { refreshCapabilities, cancelCurrentJob: cancel };
}
