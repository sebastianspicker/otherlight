/** Wires the local-only V6 dataset surface without introducing a V6 job or artifact flow. */
import {
  createScienceDatasetClient,
  type ScienceDatasetCapabilities,
  type ScienceDatasetDescriptor,
  type ScienceDatasetList,
} from "../../infrastructure/science";
import { isGitHubPagesRuntime } from "../runtime/deployment";

type ScienceDatasetClient = Pick<
  ReturnType<typeof createScienceDatasetClient>,
  "getCapabilities" | "importDataset" | "listDatasets" | "getDataset" | "deleteDataset"
>;

type ScienceDatasetWorkspaceArgs = {
  signal: AbortSignal;
  client?: ScienceDatasetClient;
  createClient?: () => ScienceDatasetClient;
  isGitHubPages?: boolean;
};

export type ScienceDatasetWorkspaceController = {
  refresh: () => Promise<void>;
};

type ScienceDatasetWorkspaceElements = {
  workspace: HTMLElement;
  capabilityStatus: HTMLElement;
  persistence: HTMLElement;
  limits: HTMLElement;
  file: HTMLInputElement;
  refreshButton: HTMLButtonElement;
  importButton: HTMLButtonElement;
  status: HTMLElement;
  list: HTMLUListElement;
  metadata: HTMLElement;
};

type ScienceDatasetWorkspaceState = {
  selectedFile: File | null;
  activeRequest: AbortController | null;
  datasets: readonly ScienceDatasetDescriptor[];
};

function requiredElement<T extends Element>(id: string, constructor: { new (): T }): T {
  const element = document.getElementById(id);
  if (!(element instanceof constructor)) throw new Error(`Missing V6 dataset workspace element #${id}.`);
  return element;
}

function getElements(): ScienceDatasetWorkspaceElements {
  return {
    workspace: requiredElement("scienceDatasetWorkspace", HTMLElement),
    capabilityStatus: requiredElement("scienceDatasetCapabilityStatus", HTMLElement),
    persistence: requiredElement("scienceDatasetPersistence", HTMLElement),
    limits: requiredElement("scienceDatasetLimits", HTMLElement),
    file: requiredElement("scienceDatasetFile", HTMLInputElement),
    refreshButton: requiredElement("scienceDatasetRefreshBtn", HTMLButtonElement),
    importButton: requiredElement("scienceDatasetImportBtn", HTMLButtonElement),
    status: requiredElement("scienceDatasetStatus", HTMLElement),
    list: requiredElement("scienceDatasetList", HTMLElement) as HTMLUListElement,
    metadata: requiredElement("scienceDatasetMetadata", HTMLElement),
  };
}

function errorMessage(error: unknown): string {
  if (error instanceof DOMException && error.name === "AbortError")
    return "The V6 dataset request was cancelled.";
  return error instanceof Error ? error.message : String(error);
}

function formatBytes(value: number): string {
  return `${(value / (1024 * 1024)).toFixed(value % (1024 * 1024) === 0 ? 0 : 1)} MiB`;
}

function renderCapabilities(
  elements: ScienceDatasetWorkspaceElements,
  capabilities: ScienceDatasetCapabilities,
): void {
  const { datasetImports } = capabilities;
  elements.capabilityStatus.textContent = "Available (local loopback)";
  elements.persistence.textContent =
    datasetImports.persistence === "process-memory" ? "Process memory only" : datasetImports.persistence;
  elements.limits.textContent = [
    `${datasetImports.limits.maxDatasets} datasets`,
    `${formatBytes(datasetImports.limits.maxSourceBytes)} source each`,
    `${datasetImports.limits.maxSamplesPerDataset.toLocaleString()} samples each`,
    `${datasetImports.limits.maxAggregateSamples.toLocaleString()} samples total`,
  ].join("; ");
}

function descriptorText(descriptor: ScienceDatasetDescriptor): string {
  return JSON.stringify(
    {
      id: descriptor.id,
      kind: descriptor.kind,
      sampleCount: descriptor.sampleCount,
      mediaType: descriptor.mediaType,
      sourceByteSha256: descriptor.sourceByteSha256,
      contentSha256: descriptor.contentSha256,
    },
    null,
    2,
  );
}

function renderDatasetList(
  elements: ScienceDatasetWorkspaceElements,
  datasets: readonly ScienceDatasetDescriptor[],
  onInspect: (datasetId: string) => void,
  onDelete: (datasetId: string) => void,
): void {
  elements.list.replaceChildren();
  if (datasets.length === 0) {
    const empty = document.createElement("li");
    empty.className = "science-dataset-empty";
    empty.textContent = "No V6 datasets have been loaded.";
    elements.list.append(empty);
    return;
  }
  for (const dataset of datasets) {
    const item = document.createElement("li");
    item.className = "science-dataset-item";
    const details = document.createElement("div");
    details.className = "science-dataset-item__details";
    const title = document.createElement("strong");
    title.textContent = dataset.kind;
    const facts = document.createElement("span");
    facts.textContent = `${dataset.sampleCount.toLocaleString()} samples · content ${dataset.contentSha256} · source ${dataset.sourceByteSha256}`;
    details.append(title, facts);
    const actions = document.createElement("div");
    actions.className = "science-dataset-item__actions";
    const inspect = document.createElement("button");
    inspect.type = "button";
    inspect.textContent = "Metadata";
    inspect.setAttribute("aria-label", `View metadata for ${dataset.id}`);
    inspect.addEventListener("click", () => onInspect(dataset.id));
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "Delete";
    remove.setAttribute("aria-label", `Delete local dataset ${dataset.id}`);
    remove.addEventListener("click", () => onDelete(dataset.id));
    actions.append(inspect, remove);
    item.append(details, actions);
    elements.list.append(item);
  }
}

function setBusy(
  elements: ScienceDatasetWorkspaceElements,
  state: ScienceDatasetWorkspaceState,
  busy: boolean,
): void {
  elements.workspace.setAttribute("aria-busy", String(busy));
  elements.file.disabled = busy;
  elements.refreshButton.disabled = busy;
  elements.importButton.disabled = busy || state.selectedFile === null;
}

function startRequest(
  elements: ScienceDatasetWorkspaceElements,
  state: ScienceDatasetWorkspaceState,
): AbortSignal {
  state.activeRequest?.abort();
  state.activeRequest = new AbortController();
  setBusy(elements, state, true);
  return state.activeRequest.signal;
}

function finishRequest(
  elements: ScienceDatasetWorkspaceElements,
  state: ScienceDatasetWorkspaceState,
  signal: AbortSignal,
): void {
  if (state.activeRequest?.signal !== signal) return;
  state.activeRequest = null;
  setBusy(elements, state, false);
}

function isCurrentRequest(state: ScienceDatasetWorkspaceState, signal: AbortSignal): boolean {
  return state.activeRequest?.signal === signal;
}

function updateDatasets(
  elements: ScienceDatasetWorkspaceElements,
  state: ScienceDatasetWorkspaceState,
  datasets: ScienceDatasetList,
  inspect: (datasetId: string) => void,
  remove: (datasetId: string) => void,
): void {
  state.datasets = datasets.datasets;
  renderDatasetList(elements, state.datasets, inspect, remove);
}

export function wireScienceDatasetWorkspace(
  args: ScienceDatasetWorkspaceArgs,
): ScienceDatasetWorkspaceController {
  if (args.isGitHubPages ?? isGitHubPagesRuntime()) return { refresh: async () => {} };
  const elements = getElements();
  const client = args.client ?? args.createClient?.() ?? createScienceDatasetClient();
  const state: ScienceDatasetWorkspaceState = { selectedFile: null, activeRequest: null, datasets: [] };

  const inspect = async (datasetId: string): Promise<void> => {
    if (args.signal.aborted) return;
    const signal = startRequest(elements, state);
    elements.status.textContent = "Loading validated dataset metadata…";
    try {
      const descriptor = await client.getDataset(datasetId, signal);
      if (!isCurrentRequest(state, signal)) return;
      elements.metadata.textContent = descriptorText(descriptor);
      elements.status.textContent = `Metadata loaded for ${descriptor.kind} (${descriptor.sampleCount.toLocaleString()} samples).`;
    } catch (error) {
      if (!isCurrentRequest(state, signal)) return;
      elements.status.textContent = `Dataset metadata could not be loaded: ${errorMessage(error)}`;
    } finally {
      finishRequest(elements, state, signal);
    }
  };

  const remove = async (datasetId: string): Promise<void> => {
    if (args.signal.aborted) return;
    const signal = startRequest(elements, state);
    elements.status.textContent = "Deleting the selected local dataset…";
    try {
      const removed = await client.deleteDataset(datasetId, signal);
      if (!isCurrentRequest(state, signal)) return;
      const datasets = await client.listDatasets(signal);
      if (!isCurrentRequest(state, signal)) return;
      updateDatasets(elements, state, datasets, inspect, remove);
      elements.metadata.textContent = `Deleted local dataset ${removed.id}.`;
      elements.status.textContent = `Deleted ${removed.kind}; ${datasets.datasets.length} local dataset(s) remain.`;
    } catch (error) {
      if (!isCurrentRequest(state, signal)) return;
      elements.status.textContent = `Dataset deletion failed; the current list is unchanged: ${errorMessage(error)}`;
    } finally {
      finishRequest(elements, state, signal);
    }
  };

  const refresh = async (): Promise<void> => {
    if (args.signal.aborted) return;
    const signal = startRequest(elements, state);
    elements.capabilityStatus.textContent = "Checking…";
    elements.status.textContent = "Validating the loopback V6 dataset capability contract…";
    try {
      const capabilities = await client.getCapabilities(signal);
      if (!isCurrentRequest(state, signal)) return;
      const datasets = await client.listDatasets(signal);
      if (!isCurrentRequest(state, signal)) return;
      renderCapabilities(elements, capabilities);
      updateDatasets(elements, state, datasets, inspect, remove);
      elements.status.textContent = `${datasets.datasets.length} local dataset(s) available. V6 remains dataset-only.`;
    } catch (error) {
      if (!isCurrentRequest(state, signal)) return;
      elements.capabilityStatus.textContent = "Unavailable";
      elements.status.textContent = `V6 dataset backend check failed; existing data is preserved: ${errorMessage(error)}`;
    } finally {
      finishRequest(elements, state, signal);
    }
  };

  const importSelectedFile = async (): Promise<void> => {
    const file = state.selectedFile;
    if (!file || args.signal.aborted) return;
    const signal = startRequest(elements, state);
    elements.status.textContent = `Importing ${file.name} (${file.size.toLocaleString()} bytes) into local process memory…`;
    try {
      const descriptor = await client.importDataset(file, signal);
      if (!isCurrentRequest(state, signal)) return;
      const datasets = await client.listDatasets(signal);
      if (!isCurrentRequest(state, signal)) return;
      updateDatasets(elements, state, datasets, inspect, remove);
      elements.metadata.textContent = descriptorText(descriptor);
      elements.status.textContent = `Imported ${descriptor.kind}: ${descriptor.sampleCount.toLocaleString()} samples, content hash ${descriptor.contentSha256}.`;
      state.selectedFile = null;
      elements.file.value = "";
    } catch (error) {
      if (!isCurrentRequest(state, signal)) return;
      elements.status.textContent = `Dataset import failed; the current list is unchanged: ${errorMessage(error)}`;
    } finally {
      finishRequest(elements, state, signal);
    }
  };

  elements.file.addEventListener(
    "change",
    () => {
      state.selectedFile = elements.file.files?.item(0) ?? null;
      elements.importButton.disabled = state.selectedFile === null;
      elements.status.textContent = state.selectedFile
        ? `Selected ${state.selectedFile.name} (${state.selectedFile.size.toLocaleString()} bytes). The client will verify its JSON filename, local media type, and size before upload.`
        : "Choose a dataset JSON file to import into local process memory.";
    },
    { signal: args.signal },
  );
  elements.refreshButton.addEventListener("click", () => void refresh(), { signal: args.signal });
  elements.importButton.addEventListener("click", () => void importSelectedFile(), { signal: args.signal });
  args.signal.addEventListener("abort", () => state.activeRequest?.abort(), { once: true });
  setBusy(elements, state, false);
  return { refresh };
}
