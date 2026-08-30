/** Owns portable workspace documents and URL-history restoration for one bootstrap instance. */

import { buildScientificForwardRequestFromEducationScenarioV4 } from "../../infrastructure/science";
import { toEducationScenarioV4 } from "../../application/browserScenarioAdapter";
import { DEFAULT_BINARY_LAB_CONFIG_V4 } from "../../application/binaryLab";
import { readBootstrapRuntimeMode } from "../../application/bootstrapRuntime";
import { readUiMode, syncUiModeVisibility } from "../ui/mode";
import { readProductMode, syncProductModeVisibility } from "../ui/productMode";
import { parseProductViewState } from "../../application/productViewState";
import type { UiRefs } from "../ui/refs";
import {
  encodeWorkspaceDocument,
  workspaceGuidedLabState,
  type WorkspaceDocumentV1,
} from "../../infrastructure/workspace/workspaceDocument";
import {
  applyProductLessonSelection,
  applyProductViewControlState,
  readProductViewStateFromControls,
} from "./bootstrapProductSetup";
import type { BootstrapProfileController } from "./bootstrapProfile";
import { runWithErrorHandling } from "./runWithErrorHandling";
import { restoreWorkspace, workspaceProductControls } from "./bootstrapWorkspaceRestore";
import {
  isBinaryModeActive,
  type ScenarioApplyGuard,
  type ScenarioFlowDeps,
  type ScenarioFlowState,
} from "./scenarioFlow";

/** The extension changed with the product name; the workspace-v1 document remains byte-compatible. */
export const WORKSPACE_DOWNLOAD_FILENAME = "otherlight-workspace.otherlight";

type PersistenceState = Pick<ScenarioFlowState, "params" | "didacticsRuntime" | "binaryLabState">;

type BootstrapPersistenceArgs = {
  refs: UiRefs;
  state: PersistenceState;
  fallbackLesson: string;
  applyGuard: ScenarioApplyGuard;
  scenarioDeps: ScenarioFlowDeps;
  profileController: BootstrapProfileController;
  currentLessonSimMode: () => "preset-lab" | "binary-lab";
  setRestoringHistory: (restoring: boolean) => void;
  syncModeNavigation: () => void;
  syncBinaryUi: () => void;
  renderDidacticsSurface: () => void;
  invalidate: () => void;
  applyActive: () => Promise<void>;
  setAppStatus: (message: string) => void;
  writeProductHistory: (kind: "push" | "replace") => void;
  warnEl: HTMLElement | null;
  signal: AbortSignal;
};

function scientificWorkspaceRequest(refs: UiRefs, state: PersistenceState) {
  if (refs.productProfileSelect.value !== "scientific") return undefined;
  const durationHours = (document.getElementById("scienceDurationHours") as HTMLInputElement | null)
    ?.valueAsNumber;
  const cadenceSec = (document.getElementById("scienceCadenceSec") as HTMLInputElement | null)?.valueAsNumber;
  const seed = (document.getElementById("scienceSeed") as HTMLInputElement | null)?.valueAsNumber;
  if (!Number.isFinite(durationHours) || !Number.isFinite(cadenceSec) || !Number.isSafeInteger(seed)) {
    throw new Error("Scientific controls must be valid before saving this workspace.");
  }
  return {
    request: buildScientificForwardRequestFromEducationScenarioV4({
      scenario: toEducationScenarioV4({
        system: state.params,
        binaryMode: isBinaryModeActive(refs),
        runtimeMode: "reference",
        executionMode: "scientific-browser",
      }),
      startOffsetSec: 0,
      endOffsetSec: (durationHours as number) * 3_600,
      sampleCadenceSec: cadenceSec as number,
      seed: seed as number,
    }),
  };
}

function saveWorkspace(args: BootstrapPersistenceArgs): void {
  const { refs, state } = args;
  const scientific = scientificWorkspaceRequest(refs, state);
  const workspaceDocument: WorkspaceDocumentV1 = {
    schemaVersion: "workspace-v1",
    productContext: readProductViewStateFromControls({
      productProfileSelect: refs.productProfileSelect,
      productModeSelect: refs.productModeSelect,
      uiModeSelect: refs.uiModeSelect,
      simModeSelect: refs.simModeSelect,
      runtimeModeSelect: refs.runtimeModeSelect,
      presetSelect: refs.presetSelect,
      realSystemSelect: refs.realSystemSelect,
      lessonSelect: refs.didLessonSelect,
      fallbackLesson: args.fallbackLesson,
    }),
    education: {
      scenario: toEducationScenarioV4({
        system: state.params,
        binaryMode: isBinaryModeActive(refs),
        runtimeMode: readBootstrapRuntimeMode(refs.runtimeModeSelect?.value),
        binaryLabDefaults: DEFAULT_BINARY_LAB_CONFIG_V4.binaryLab,
      }),
      guidedLab: workspaceGuidedLabState({
        learning: state.didacticsRuntime.learning,
        responses: state.didacticsRuntime.responses,
        hintLevel: state.params.didactics?.hintLevel ?? "L1",
        binaryLab: state.binaryLabState,
      }),
    },
    ...(scientific ? { scientific } : {}),
  };
  const blob = new Blob([encodeWorkspaceDocument(workspaceDocument)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = WORKSPACE_DOWNLOAD_FILENAME;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
  args.setAppStatus("Workspace saved as a portable .otherlight document.");
}

function restoreBrowserHistory(args: BootstrapPersistenceArgs): void {
  const parsed = parseProductViewState(new URLSearchParams(window.location.search));
  args.setRestoringHistory(true);
  applyProductViewControlState(workspaceProductControls(args.refs), parsed);
  args.profileController.syncFromControl();
  syncProductModeVisibility(readProductMode(args.refs.productModeSelect.value));
  syncUiModeVisibility(readUiMode(args.refs.uiModeSelect.value));
  args.syncModeNavigation();
  runWithErrorHandling(
    async () => {
      try {
        await args.applyActive();
        if (applyProductLessonSelection(args.refs.didLessonSelect, parsed.state.lesson, parsed.corrections)) {
          args.refs.didLessonSelect?.dispatchEvent(new Event("change", { bubbles: true }));
        }
        args.setAppStatus(
          parsed.corrections.length > 0
            ? `History restored with corrections. ${parsed.corrections.join(" ")}`
            : "Shared context restored from browser history.",
        );
      } finally {
        args.setRestoringHistory(false);
        if (parsed.corrections.length > 0) args.writeProductHistory("replace");
      }
    },
    { statusEl: args.warnEl, errorPrefix: "Could not restore shared context: " },
  );
}

export function wireBootstrapPersistence(args: BootstrapPersistenceArgs): void {
  const workspaceOpenBtn = document.getElementById("workspaceOpenBtn") as HTMLButtonElement | null;
  const workspaceSaveBtn = document.getElementById("workspaceSaveBtn") as HTMLButtonElement | null;
  const workspaceFileInput = document.getElementById("workspaceFileInput") as HTMLInputElement | null;
  const listenerOptions: AddEventListenerOptions = { signal: args.signal };

  workspaceSaveBtn?.addEventListener(
    "click",
    () =>
      runWithErrorHandling(() => saveWorkspace(args), {
        statusEl: args.warnEl,
        errorPrefix: "Workspace save failed: ",
      }),
    listenerOptions,
  );
  workspaceOpenBtn?.addEventListener("click", () => workspaceFileInput?.click(), listenerOptions);
  workspaceFileInput?.addEventListener(
    "change",
    () => {
      const file = workspaceFileInput.files?.[0];
      workspaceFileInput.value = "";
      if (!file) return;
      runWithErrorHandling(async () => restoreWorkspace(args, await file.text()), {
        statusEl: args.warnEl,
        errorPrefix: "Workspace import failed: ",
      });
    },
    listenerOptions,
  );
  window.addEventListener("popstate", () => restoreBrowserHistory(args), listenerOptions);
}
