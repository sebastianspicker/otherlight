/** Owns portable workspace documents and URL-history restoration for one bootstrap instance. */

import { toEducationScenarioV4 } from "../../application/browserScenarioAdapter";
import type { BinaryLabConfigV4 } from "../../domain/simulation/v4/types";
import { readBootstrapRuntimeMode } from "../../application/runtime/runtimeArgs";
import { readUiMode, syncUiModeVisibility } from "../shell/mode";
import { readProductMode, syncProductModeVisibility } from "../shell/productMode";
import { parseProductViewState } from "../../application/productViewState";
import type { UiRefs } from "../shell/refs";
import {
  encodeWorkspaceDocument,
  workspaceGuidedLabState,
  type WorkspaceDocumentV1,
} from "../../infrastructure/workspace/workspaceDocument";
import {
  applyProductLessonSelection,
  applyProductViewControlState,
  readProductViewStateFromControls,
} from "../shell/productNavigation";
import type { BootstrapProfileController } from "../shell/profileSwitch";
import { runWithErrorHandling } from "../shell/runWithErrorHandling";
import { restoreWorkspace, workspaceProductControls, type WorkspaceSettingsState } from "./workspaceRestore";
import { wireUnloadGuard } from "./unloadGuard";
import {
  isBinaryModeActive,
  type ScenarioApplyGuard,
  type ScenarioFlowDeps,
  type ScenarioFlowState,
} from "../scenario/scenarioFlow";

/** The extension changed with the product name; the workspace-v1 document remains byte-compatible. */
export const WORKSPACE_DOWNLOAD_FILENAME = "otherlight-workspace.otherlight";

type PersistenceState = Pick<ScenarioFlowState, "params" | "didacticsRuntime" | "binaryLabState"> &
  WorkspaceSettingsState;

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
  hasUnappliedEdits: () => boolean;
  warnEl: HTMLElement | null;
  signal: AbortSignal;
};

function isScientificProfile(args: BootstrapPersistenceArgs): boolean {
  return args.refs.productProfileSelect.value === "scientific";
}

/**
 * The request the next run would submit: a still-valid restored request, or one compiled from
 * the scenario. When the run form is invalid or the scenario cannot compile to V5, the work is
 * still saved, as an Education workspace (workspace-v1 carries `scientific` exactly when the
 * profile is Scientific), and the reason is reported.
 */
function scientificWorkspaceRequest(args: BootstrapPersistenceArgs) {
  if (!isScientificProfile(args)) return { scientific: undefined, omitted: undefined };
  try {
    return { scientific: { request: args.profileController.currentScientificRequest() }, omitted: undefined };
  } catch (error) {
    return { scientific: undefined, omitted: error instanceof Error ? error.message : String(error) };
  }
}

function workspaceBinaryLabConfig(state: PersistenceState): BinaryLabConfigV4 {
  return {
    enabled: state.workspaceScenarioSettings.binaryLabEnabled ?? true,
    hideSkyUntilReveal: state.binaryLabState.hideSkyUntilReveal,
    requireHypothesis: state.binaryLabState.requireHypothesis,
    lockParamsUntilHypothesis: state.binaryLabState.lockParamsUntilHypothesis,
  };
}

function workspaceEducationScenario(refs: UiRefs, state: PersistenceState) {
  const binaryLab = workspaceBinaryLabConfig(state);
  const scenario = toEducationScenarioV4({
    system: state.params,
    binaryMode: isBinaryModeActive(refs),
    runtimeMode: readBootstrapRuntimeMode(refs.runtimeModeSelect?.value),
    executionMode: state.workspaceScenarioSettings.executionMode,
    referenceSubsteps: state.workspaceScenarioSettings.referenceSubsteps,
    binaryLabDefaults: binaryLab,
  });
  return { ...scenario, binaryLab };
}

function saveWorkspace(args: BootstrapPersistenceArgs): void {
  const { refs, state } = args;
  const { scientific, omitted } = scientificWorkspaceRequest(args);
  const productContext = readProductViewStateFromControls({
    productProfileSelect: refs.productProfileSelect,
    productModeSelect: refs.productModeSelect,
    uiModeSelect: refs.uiModeSelect,
    simModeSelect: refs.simModeSelect,
    runtimeModeSelect: refs.runtimeModeSelect,
    presetSelect: refs.presetSelect,
    realSystemSelect: refs.realSystemSelect,
    lessonSelect: refs.didLessonSelect,
    fallbackLesson: args.fallbackLesson,
  });
  const workspaceDocument: WorkspaceDocumentV1 = {
    schemaVersion: "workspace-v1",
    productContext: omitted === undefined ? productContext : { ...productContext, profile: "education" },
    education: {
      scenario: workspaceEducationScenario(refs, state),
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
  args.setAppStatus(
    omitted === undefined
      ? "Workspace saved as a portable .otherlight document."
      : `Workspace saved as an Education workspace because the Scientific request could not be built (${omitted}). The scenario and Guided Lab state are included.`,
  );
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
  // The Education status line and warning sit in the Education-only page, so in the Scientific
  // profile save and open report through the profile-neutral workspace status line instead.
  const workspaceStatus = document.getElementById("workspaceStatus");
  const showWorkspaceStatus = (message: string): void => {
    if (workspaceStatus) workspaceStatus.textContent = isScientificProfile(args) ? message : "";
  };
  const reportingArgs: BootstrapPersistenceArgs = {
    ...args,
    setAppStatus: (message) => {
      args.setAppStatus(message);
      showWorkspaceStatus(message);
    },
  };
  const errorTarget = (): HTMLElement | null => (isScientificProfile(args) ? workspaceStatus : args.warnEl);
  const unloadGuard = wireUnloadGuard({
    responses: () => args.state.didacticsRuntime.responses,
    hasUnappliedEdits: args.hasUnappliedEdits,
    signal: args.signal,
  });

  workspaceSaveBtn?.addEventListener(
    "click",
    () =>
      runWithErrorHandling(
        () => {
          saveWorkspace(reportingArgs);
          unloadGuard.markSaved();
        },
        {
          statusEl: errorTarget(),
          errorPrefix: "Workspace save failed: ",
        },
      ),
    listenerOptions,
  );
  workspaceOpenBtn?.addEventListener("click", () => workspaceFileInput?.click(), listenerOptions);
  workspaceFileInput?.addEventListener(
    "change",
    () => {
      const file = workspaceFileInput.files?.[0];
      workspaceFileInput.value = "";
      if (!file) return;
      runWithErrorHandling(
        async () => {
          if (await restoreWorkspace(reportingArgs, await file.text())) unloadGuard.markSaved();
        },
        {
          statusEl: errorTarget(),
          errorPrefix: "Workspace import failed: ",
        },
      );
    },
    listenerOptions,
  );
  window.addEventListener("popstate", () => restoreBrowserHistory(args), listenerOptions);
}
