/** Covers the accessible local-only V6 dataset presentation flow. */
import { JSDOM } from "jsdom";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SCIENCE_DATASET_MEDIA_TYPE,
  type ScienceDatasetCapabilities,
  type ScienceDatasetDescriptor,
} from "../../src/infrastructure/science";
import { wireScienceDatasetWorkspace } from "../../src/presentation/controllers/scienceDatasetWorkspace";
import { renderScientificDatasetWorkspace } from "../../src/presentation/ui/templates/scientificWorkspace";

const descriptor: ScienceDatasetDescriptor = {
  schemaVersion: "science-dataset-descriptor-v2",
  id: `ds-${"b".repeat(64)}`,
  kind: "passband-response",
  sampleCount: 3,
  mediaType: SCIENCE_DATASET_MEDIA_TYPE,
  sourceByteSha256: "a".repeat(64),
  contentSha256: "b".repeat(64),
};

const capabilities: ScienceDatasetCapabilities = {
  schemaVersion: "science-v6",
  supportedJobKinds: [],
  datasetImports: {
    mediaType: SCIENCE_DATASET_MEDIA_TYPE,
    kinds: ["passband-response"],
    limits: {
      maxSourceBytes: 8 * 1024 * 1024,
      maxDatasets: 16,
      maxSamplesPerDataset: 100_000,
      maxAggregateSamples: 400_000,
      maxNormalizedBytes: 64 * 1024 * 1024,
    },
    persistence: "process-memory",
  },
};

type DomGlobals = {
  window: typeof window;
  document: typeof document;
  HTMLElement: typeof HTMLElement;
  HTMLInputElement: typeof HTMLInputElement;
  HTMLButtonElement: typeof HTMLButtonElement;
  HTMLUListElement: typeof HTMLUListElement;
  File: typeof File;
  AbortController: typeof AbortController;
  AbortSignal: typeof AbortSignal;
  DOMException: typeof DOMException;
  Event: typeof Event;
};

let restoreDomGlobals: (() => void) | undefined;

afterEach(() => {
  restoreDomGlobals?.();
  vi.unstubAllEnvs();
});

function installDatasetDom(): void {
  const dom = new JSDOM(`<!doctype html><body>${renderScientificDatasetWorkspace(false)}</body>`, {
    url: "http://localhost/",
  });
  const previous: DomGlobals = {
    window: globalThis.window,
    document: globalThis.document,
    HTMLElement: globalThis.HTMLElement,
    HTMLInputElement: globalThis.HTMLInputElement,
    HTMLButtonElement: globalThis.HTMLButtonElement,
    HTMLUListElement: globalThis.HTMLUListElement,
    File: globalThis.File,
    AbortController: globalThis.AbortController,
    AbortSignal: globalThis.AbortSignal,
    DOMException: globalThis.DOMException,
    Event: globalThis.Event,
  };
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    HTMLInputElement: dom.window.HTMLInputElement,
    HTMLButtonElement: dom.window.HTMLButtonElement,
    HTMLUListElement: dom.window.HTMLUListElement,
    File: dom.window.File,
    AbortController: dom.window.AbortController,
    AbortSignal: dom.window.AbortSignal,
    DOMException: dom.window.DOMException,
    Event: dom.window.Event,
  });
  restoreDomGlobals = () => {
    Object.assign(globalThis, previous);
    dom.window.close();
    restoreDomGlobals = undefined;
  };
}

function clientWith(datasets: readonly ScienceDatasetDescriptor[] = [descriptor]) {
  return {
    getCapabilities: vi.fn(async () => capabilities),
    importDataset: vi.fn(async () => descriptor),
    listDatasets: vi.fn(async () => ({ datasets })),
    getDataset: vi.fn(async () => descriptor),
    deleteDataset: vi.fn(async () => descriptor),
  };
}

describe("V6 dataset workspace", () => {
  it("discovers local capabilities, lists provenance, inspects metadata, and deletes only after success", async () => {
    installDatasetDom();
    const client = clientWith();
    const controller = wireScienceDatasetWorkspace({
      client,
      signal: new AbortController().signal,
      isGitHubPages: false,
    });

    await controller.refresh();

    expect(client.getCapabilities).toHaveBeenCalledOnce();
    expect(client.listDatasets).toHaveBeenCalledOnce();
    expect(document.getElementById("scienceDatasetCapabilityStatus")?.textContent).toContain("Available");
    expect(document.getElementById("scienceDatasetList")?.textContent).toContain(descriptor.contentSha256);
    expect(document.getElementById("scienceDatasetList")?.textContent).toContain("3 samples");

    (document.querySelector('[aria-label^="View metadata"]') as HTMLButtonElement).click();
    await vi.waitFor(() =>
      expect(client.getDataset).toHaveBeenCalledWith(descriptor.id, expect.any(AbortSignal)),
    );
    expect(document.getElementById("scienceDatasetMetadata")?.textContent).toContain(
      descriptor.sourceByteSha256,
    );

    (document.querySelector('[aria-label^="Delete local dataset"]') as HTMLButtonElement).click();
    await vi.waitFor(() =>
      expect(client.deleteDataset).toHaveBeenCalledWith(descriptor.id, expect.any(AbortSignal)),
    );
    await vi.waitFor(() =>
      expect(document.getElementById("scienceDatasetStatus")?.textContent).toContain(
        "Deleted passband-response",
      ),
    );
  });

  it("imports the selected File through the strict client and exposes busy progress", async () => {
    installDatasetDom();
    const client = clientWith();
    const controller = wireScienceDatasetWorkspace({
      client,
      signal: new AbortController().signal,
      isGitHubPages: false,
    });
    await controller.refresh();
    const input = document.getElementById("scienceDatasetFile") as HTMLInputElement;
    const file = new File(['{"schemaVersion":"science-dataset-v2"}'], "passband.json", {
      type: SCIENCE_DATASET_MEDIA_TYPE,
    });
    Object.defineProperty(input, "files", { configurable: true, value: { item: () => file } });
    input.dispatchEvent(new Event("change"));

    (document.getElementById("scienceDatasetImportBtn") as HTMLButtonElement).click();

    await vi.waitFor(() => expect(client.importDataset).toHaveBeenCalledWith(file, expect.any(AbortSignal)));
    await vi.waitFor(() =>
      expect(document.getElementById("scienceDatasetWorkspace")?.getAttribute("aria-busy")).toBe("false"),
    );
    expect(document.getElementById("scienceDatasetStatus")?.textContent).toContain(
      "Imported passband-response",
    );
  });

  it("does not render or construct a V6 client in GitHub Pages mode", async () => {
    vi.stubEnv("MODE", "github-pages");
    expect(renderScientificDatasetWorkspace()).toBe("");
    const createClient = vi.fn();
    const controller = wireScienceDatasetWorkspace({
      createClient,
      signal: new AbortController().signal,
      isGitHubPages: true,
    });

    await controller.refresh();

    expect(createClient).not.toHaveBeenCalled();
  });
});
