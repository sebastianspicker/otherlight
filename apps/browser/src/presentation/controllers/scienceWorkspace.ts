/**
 * Owns science Workspace support within the app layer. Keeps application bootstrap and frame orchestration composable.
 */
import type { BrowserScenarioDraft } from "../../domain/model/types";
import {
  buildScientificForwardRequestFromEducationScenarioV4,
  createScienceBackendClient,
  type CapabilityManifest,
  type ScienceJobResult,
  type ScienceJobStatus,
} from "../../infrastructure/science";
import { toEducationScenarioV4 } from "../../application/browserScenarioAdapter";
import { isGitHubPagesRuntime } from "../runtime/deployment";

type ScienceWorkspaceClient = Pick<
  ReturnType<typeof createScienceBackendClient>,
  "getCapabilities" | "submitJob" | "pollJob" | "getResult" | "cancelJob"
>;

type ScienceWorkspaceArgs = {
  getSystem: () => BrowserScenarioDraft;
  isBinaryMode: () => boolean;
  signal: AbortSignal;
  client?: ScienceWorkspaceClient;
  createClient?: () => ScienceWorkspaceClient;
  isGitHubPages?: boolean;
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

type ScienceRunInputs = {
  durationHours: number;
  cadenceSec: number;
  seed: number;
};

type ScienceWorkspaceState = {
  isCapabilitiesReady: () => boolean;
  getCurrentJobId: () => string | null;
  setCurrentJobId: (jobId: string | null) => void;
  setReady: (ready: boolean) => void;
  startRequest: () => AbortSignal;
  isCurrentRequest: (signal: AbortSignal) => boolean;
  finishRequest: (signal: AbortSignal) => void;
  abortActiveRequest: () => void;
  hasActiveRequest: () => boolean;
  setBusy: (busy: boolean) => void;
};

type ScienceWorkspaceContext = {
  args: ScienceWorkspaceArgs;
  client: ScienceWorkspaceClient;
  elements: ScienceWorkspaceElements;
  state: ScienceWorkspaceState;
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

function isInvalidNumber(
  value: number,
  options: { minimum: number; maximum: number; integer?: boolean },
): boolean {
  if (!Number.isFinite(value)) return true;
  if (value < options.minimum) return true;
  if (value > options.maximum) return true;
  return options.integer === true && !Number.isSafeInteger(value);
}

function inputNumber(
  input: HTMLInputElement,
  label: string,
  options: { minimum: number; maximum: number; integer?: boolean },
): number {
  const value = input.valueAsNumber;
  if (isInvalidNumber(value, options)) {
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

function readRunInputs(elements: ScienceWorkspaceElements): ScienceRunInputs {
  return {
    durationHours: inputNumber(elements.durationHours, "Duration", {
      minimum: 0.01,
      maximum: 8_760,
    }),
    cadenceSec: inputNumber(elements.cadenceSec, "Cadence", {
      minimum: 0.001,
      maximum: 31_557_600,
    }),
    seed: inputNumber(elements.seed, "Seed", {
      minimum: Number.MIN_SAFE_INTEGER,
      maximum: Number.MAX_SAFE_INTEGER,
      integer: true,
    }),
  };
}

function clearRunResult(elements: ScienceWorkspaceElements): void {
  elements.artifactLink.hidden = true;
  elements.artifactLink.removeAttribute("href");
  elements.result.textContent = "No scientific result has been accepted yet.";
}

function renderGitHubPagesUnavailable(elements: ScienceWorkspaceElements): void {
  elements.capabilityStatus.textContent = "Unavailable on GitHub Pages";
  elements.refreshButton.disabled = true;
  elements.runButton.disabled = true;
  elements.cancelButton.disabled = true;
  elements.artifactLink.hidden = true;
  elements.artifactLink.removeAttribute("href");
  elements.result.textContent = "Scientific artifacts are available only from a local V5 run.";
  elements.runStatus.textContent =
    "Scientific V5 jobs are unavailable on GitHub Pages. To run them locally, start the loopback science service with pnpm science:backend:serve.";
}

function renderCompletedRun(
  elements: ScienceWorkspaceElements,
  jobId: string,
  result: ScienceJobResult,
): void {
  elements.result.textContent = renderResult(result);
  elements.artifactLink.href = `http://127.0.0.1:8765/v1/artifacts/${encodeURIComponent(result.arrowArtifactId)}`;
  elements.artifactLink.hidden = false;
  elements.runStatus.textContent = `Scientific job ${jobId} completed; provenance is shown below.`;
}

function createScienceWorkspaceState(elements: ScienceWorkspaceElements): ScienceWorkspaceState {
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

  return {
    isCapabilitiesReady: () => capabilitiesReady,
    getCurrentJobId: () => currentJobId,
    setCurrentJobId: (jobId) => {
      currentJobId = jobId;
    },
    setReady,
    startRequest: () => {
      activeRequest?.abort();
      activeRequest = new AbortController();
      setBusy(true);
      return activeRequest.signal;
    },
    isCurrentRequest: (signal) => activeRequest?.signal === signal,
    finishRequest: (signal) => {
      if (activeRequest?.signal !== signal) return;
      activeRequest = null;
      setBusy(false);
    },
    abortActiveRequest: () => activeRequest?.abort(),
    hasActiveRequest: () => activeRequest !== null,
    setBusy,
  };
}

async function refreshScienceCapabilities({
  args,
  client,
  elements,
  state,
}: ScienceWorkspaceContext): Promise<void> {
  if (args.signal.aborted) return;
  const signal = state.startRequest();
  state.setReady(false);
  elements.capabilityStatus.textContent = "Checking…";
  elements.runStatus.textContent = "Validating the loopback V5 capability manifest.";
  try {
    const capabilities = await client.getCapabilities(signal);
    if (!state.isCurrentRequest(signal)) return;
    const supported = capabilitySupportsAlphaRun(capabilities);
    state.setReady(supported);
    elements.capabilityStatus.textContent = supported
      ? `Available (${capabilities.serviceVersion})`
      : "Connected, required capability unavailable";
    elements.runStatus.textContent = supported
      ? "The backend contract is valid. The active scenario can now be submitted for validation."
      : "This backend does not advertise the alpha forward radial-velocity contract.";
  } catch (error) {
    if (!state.isCurrentRequest(signal)) return;
    state.setReady(false);
    elements.capabilityStatus.textContent = "Unavailable";
    elements.runStatus.textContent = `Backend check failed: ${errorMessage(error)}`;
  } finally {
    state.finishRequest(signal);
  }
}

async function runScienceJob({ args, client, elements, state }: ScienceWorkspaceContext): Promise<void> {
  if (!state.isCapabilitiesReady() || args.signal.aborted) return;
  const signal = state.startRequest();
  clearRunResult(elements);
  try {
    const { durationHours, cadenceSec, seed } = readRunInputs(elements);
    const binaryMode = args.isBinaryMode();
    const request = buildScientificForwardRequestFromEducationScenarioV4({
      scenario: toEducationScenarioV4({
        system: args.getSystem(),
        binaryMode,
        runtimeMode: "reference",
        executionMode: "scientific-browser",
      }),
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
    state.setCurrentJobId(submitted.id);
    elements.runStatus.textContent = `Job ${submitted.id} is ${submitted.state}; waiting for a terminal state…`;
    const terminal = await client.pollJob(submitted.id, {
      signal,
      intervalMs: SCIENCE_POLL_INTERVAL_MS,
      maxAttempts: SCIENCE_POLL_MAX_ATTEMPTS,
    });
    if (terminal.state !== "succeeded") {
      state.setCurrentJobId(null);
      throw new Error(terminal.error?.message ?? `V5 job ended in state '${terminal.state}'.`);
    }
    state.setCurrentJobId(null);
    const result = await client.getResult(submitted.id, signal);
    renderCompletedRun(elements, submitted.id, result);
  } catch (error) {
    elements.runStatus.textContent = `Scientific run failed: ${errorMessage(error)}`;
  } finally {
    state.finishRequest(signal);
  }
}

async function cancelScienceJob({ args, client, elements, state }: ScienceWorkspaceContext): Promise<void> {
  const jobId = state.getCurrentJobId();
  state.abortActiveRequest();
  if (!jobId || args.signal.aborted) {
    state.setBusy(false);
    return;
  }
  elements.runStatus.textContent = `Cancelling scientific job ${jobId}…`;
  try {
    const status: ScienceJobStatus = await client.cancelJob(jobId, args.signal);
    state.setCurrentJobId(null);
    elements.runStatus.textContent = `Scientific job ${jobId} is ${status.state}.`;
  } catch (error) {
    elements.runStatus.textContent = `Cancellation failed: ${errorMessage(error)}`;
  } finally {
    state.setBusy(state.hasActiveRequest());
  }
}

export function wireScienceWorkspace(args: ScienceWorkspaceArgs): ScienceWorkspaceController {
  const elements = getElements();
  if (args.isGitHubPages ?? isGitHubPagesRuntime()) {
    renderGitHubPagesUnavailable(elements);
    return {
      refreshCapabilities: async () => renderGitHubPagesUnavailable(elements),
      cancelCurrentJob: async () => {},
    };
  }
  const context: ScienceWorkspaceContext = {
    args,
    client: args.client ?? args.createClient?.() ?? createScienceBackendClient(),
    elements,
    state: createScienceWorkspaceState(elements),
  };

  args.signal.addEventListener("abort", context.state.abortActiveRequest, { once: true });

  const refreshCapabilities = (): Promise<void> => refreshScienceCapabilities(context);
  const cancelCurrentJob = (): Promise<void> => cancelScienceJob(context);
  elements.refreshButton.addEventListener("click", () => void refreshCapabilities(), { signal: args.signal });
  elements.runButton.addEventListener("click", () => void runScienceJob(context), { signal: args.signal });
  elements.cancelButton.addEventListener("click", () => void cancelCurrentJob(), { signal: args.signal });
  context.state.setReady(false);
  return { refreshCapabilities, cancelCurrentJob };
}
