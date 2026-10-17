/**
 * Wires the Scientific workspace, its job, and its capability state.
 */
import type { BrowserScenarioDraft } from "../../domain/model/types";
import {
  createScienceBackendClient,
  type CapabilityManifest,
  type ForwardRunRequest,
  type ScienceJobResult,
  type ScienceJobStatus,
} from "../../infrastructure/science";
import { isGitHubPagesRuntime } from "../../application/deployment";
import { getScienceContractReplay, type ScienceContractReplay } from "./scienceContractReplay";
import { wireScienceDatasetWorkspace } from "./scienceDatasetWorkspace";
import { pollScienceJobWithinBudget, type SciencePollOutcome } from "./sciencePolling";
import { createScienceRequestSource, type ScienceRequestSource } from "./scienceRequestSource";

type ScienceWorkspaceClient = Pick<
  ReturnType<typeof createScienceBackendClient>,
  "getCapabilities" | "submitJob" | "getJob" | "getResult" | "cancelJob"
> & { readonly baseUrl?: string };

const DEFAULT_ARTIFACT_BASE_URL = "http://127.0.0.1:8765";

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
  refreshDatasets: () => Promise<void>;
  cancelCurrentJob: () => Promise<void>;
  /** Pins a validated workspace request (or clears it) as the next submission. */
  restoreRequest: (request: ForwardRunRequest | undefined) => void;
  /** The request the next run would submit; throws when the run form is invalid. */
  currentRequest: () => ForwardRunRequest;
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
  replay: HTMLElement;
  replaySource: HTMLElement;
  replayMetadata: HTMLElement;
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
  requests: ScienceRequestSource;
};

const RESTORED_REQUEST_NOTE = "The next run submits the restored workspace request unchanged.";

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
    replay: requiredElement("scienceContractReplay", HTMLElement),
    replaySource: requiredElement("scienceReplaySource", HTMLElement),
    replayMetadata: requiredElement("scienceReplayMetadata", HTMLElement),
  };
}

function capabilitySupportsAlphaRun(capabilities: CapabilityManifest): boolean {
  return (
    capabilities.supportedJobKinds.includes("forward") &&
    capabilities.supportedOutputs.includes("radial-velocity")
  );
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

function clearRunResult(elements: ScienceWorkspaceElements): void {
  elements.artifactLink.hidden = true;
  elements.artifactLink.removeAttribute("href");
  elements.replay.hidden = true;
  elements.result.textContent = "No scientific result has been accepted yet.";
}

function renderScienceContractReplay(
  elements: ScienceWorkspaceElements,
  replay: ScienceContractReplay,
): void {
  elements.replay.hidden = false;
  elements.replaySource.textContent = replay.source;
  elements.replayMetadata.textContent = JSON.stringify(
    {
      label: replay.label,
      execution: replay.execution,
      runClassification: replay.runClassification,
      resultKind: replay.resultKind,
      fixtureRunId: replay.fixtureRunId,
      inputHashSha256: replay.inputHashSha256,
      implementation: replay.implementation,
      modelVersion: replay.modelVersion,
      artifact: {
        format: replay.artifactFormat,
        rowCount: replay.artifactRowCount,
      },
    },
    null,
    2,
  );
}

function renderGitHubPagesReplay(elements: ScienceWorkspaceElements): void {
  const replay = getScienceContractReplay();
  elements.capabilityStatus.textContent = "Fixture replay only (GitHub Pages)";
  elements.refreshButton.disabled = true;
  elements.runButton.disabled = true;
  elements.cancelButton.disabled = true;
  elements.artifactLink.hidden = true;
  elements.artifactLink.removeAttribute("href");
  elements.result.textContent = "No local scientific result has been accepted in this hosted session.";
  elements.runStatus.textContent =
    "Fixture/replay only: no V5 execution occurred, and this is not a completed local or scientific run. The prospective local-run inputs above do not affect this fixture. To run locally, start the loopback science service with pnpm science:backend:serve.";
  renderScienceContractReplay(elements, replay);
}

function renderCompletedRun(
  elements: ScienceWorkspaceElements,
  baseUrl: string,
  jobId: string,
  result: ScienceJobResult,
): void {
  elements.result.textContent = renderResult(result);
  elements.artifactLink.href = `${baseUrl}/v1/artifacts/${encodeURIComponent(result.arrowArtifactId)}`;
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
  requests,
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
      ? requests.hasRestoredRequest()
        ? `The backend contract is valid. ${RESTORED_REQUEST_NOTE}`
        : "The backend contract is valid. The active scenario can now be submitted for validation."
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

function describeSubmission(restored: boolean, binaryMode: boolean): string {
  if (restored)
    return "Submitting the restored workspace request unchanged to the V5 Newtonian validity checks.";
  return binaryMode
    ? "Submitting the active detached-binary lab state to the V5 Newtonian validity checks."
    : "Submitting the active star/planet/moon state to the V5 Newtonian validity checks.";
}

async function cancelAfterBudget(
  { args, client, elements }: ScienceWorkspaceContext,
  jobId: string,
  outcome: Extract<SciencePollOutcome, { kind: "budget-exhausted" }>,
): Promise<void> {
  const limit = `${Math.round(outcome.budgetMs / 1_000)} s ${outcome.phase === "queued" ? "in the queue" : "of running"}`;
  try {
    const status = await client.cancelJob(jobId, args.signal);
    elements.runStatus.textContent = `Scientific job ${jobId} did not finish within ${limit}; it was cancelled (${status.state}).`;
  } catch (error) {
    elements.runStatus.textContent = `Scientific job ${jobId} did not finish within ${limit}; cancelling it failed: ${errorMessage(error)}`;
  }
}

async function runScienceJob(context: ScienceWorkspaceContext): Promise<void> {
  const { args, client, elements, state, requests } = context;
  if (!state.isCapabilitiesReady() || args.signal.aborted) return;
  const signal = state.startRequest();
  clearRunResult(elements);
  try {
    const restored = requests.hasRestoredRequest();
    const request = requests.current();
    elements.scenarioSummary.textContent = describeSubmission(restored, args.isBinaryMode());
    elements.runStatus.textContent = "Submitting the validated V5 request…";
    const submitted = await client.submitJob(request, signal);
    state.setCurrentJobId(submitted.id);
    elements.runStatus.textContent = `Job ${submitted.id} is ${submitted.state}; waiting for a terminal state…`;
    const outcome = await pollScienceJobWithinBudget(client, submitted.id, signal);
    state.setCurrentJobId(null);
    if (outcome.kind === "budget-exhausted") {
      await cancelAfterBudget(context, submitted.id, outcome);
      return;
    }
    if (outcome.status.state !== "succeeded") {
      throw new Error(outcome.status.error?.message ?? `V5 job ended in state '${outcome.status.state}'.`);
    }
    const result = await client.getResult(submitted.id, signal);
    renderCompletedRun(elements, client.baseUrl ?? DEFAULT_ARTIFACT_BASE_URL, submitted.id, result);
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
  const requests = createScienceRequestSource(args, elements);
  if (args.isGitHubPages ?? isGitHubPagesRuntime()) {
    renderGitHubPagesReplay(elements);
    return {
      refreshCapabilities: async () => renderGitHubPagesReplay(elements),
      refreshDatasets: async () => {},
      cancelCurrentJob: async () => {},
      restoreRequest: requests.restore,
      currentRequest: requests.current,
    };
  }
  const datasets = wireScienceDatasetWorkspace({ signal: args.signal });
  const context: ScienceWorkspaceContext = {
    args,
    client: args.client ?? args.createClient?.() ?? createScienceBackendClient(),
    elements,
    state: createScienceWorkspaceState(elements),
    requests,
  };

  args.signal.addEventListener("abort", context.state.abortActiveRequest, { once: true });

  const refreshCapabilities = (): Promise<void> => refreshScienceCapabilities(context);
  const cancelCurrentJob = (): Promise<void> => cancelScienceJob(context);
  const restoreRequest = (request: ForwardRunRequest | undefined): void => {
    requests.restore(request);
    if (request && context.state.isCapabilitiesReady()) {
      elements.runStatus.textContent = RESTORED_REQUEST_NOTE;
    }
  };
  elements.refreshButton.addEventListener("click", () => void refreshCapabilities(), { signal: args.signal });
  elements.runButton.addEventListener("click", () => void runScienceJob(context), { signal: args.signal });
  elements.cancelButton.addEventListener("click", () => void cancelCurrentJob(), { signal: args.signal });
  context.state.setReady(false);
  return {
    refreshCapabilities,
    refreshDatasets: datasets.refresh,
    cancelCurrentJob,
    restoreRequest,
    currentRequest: requests.current,
  };
}
