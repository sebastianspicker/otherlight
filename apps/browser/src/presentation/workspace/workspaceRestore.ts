/** Restores validated workspace documents without broadening bootstrap persistence wiring. */

import {
  toBrowserScenarioDraftFromEducationScenarioV4,
  type RuntimeExecutionModeV4,
} from "../../domain/simulation/v4";
import type { BrowserScenarioDraft } from "../../domain/model/types";
import { createBinaryLabState } from "../../domain/education/binaryLab";
import { SCENARIO_DEFAULTS } from "../../application/catalog/defaults";
import { DEFAULT_BINARY_LAB_CONFIG_V4 } from "../../application/catalog/binaryLab";
import { readUiMode, syncUiModeVisibility } from "../shell/mode";
import { readProductMode, syncProductModeVisibility } from "../shell/productMode";
import type { UiRefs } from "../shell/refs";
import {
  parseWorkspaceDocumentJson,
  type WorkspaceDocumentV1,
} from "../../infrastructure/workspace/workspaceDocument";
import { syncDidacticsControlsFromParams } from "../labs/didactics";
import { applyProductLessonSelection, applyProductViewControlState } from "../shell/productNavigation";
import type { BootstrapProfileController } from "../shell/profileSwitch";
import {
  applyScenarioParams,
  withScenarioApplyGuard,
  type ScenarioApplyGuard,
  type ScenarioFlowDeps,
  type ScenarioFlowState,
} from "../scenario/scenarioFlow";

/**
 * Education V4 settings that the authoring form has no control for. They are
 * carried from an opened workspace into the runtime and back into the next save;
 * an empty object means the compiler defaults.
 */
type WorkspaceScenarioSettings = {
  referenceSubsteps?: number;
  executionMode?: RuntimeExecutionModeV4;
  binaryLabEnabled?: boolean;
};

export type WorkspaceSettingsState = { workspaceScenarioSettings: WorkspaceScenarioSettings };

type RestoreState = Pick<ScenarioFlowState, "params" | "didacticsRuntime" | "binaryLabState"> &
  WorkspaceSettingsState;

type RestoreWorkspaceArgs = {
  refs: UiRefs;
  state: RestoreState;
  applyGuard: ScenarioApplyGuard;
  scenarioDeps: ScenarioFlowDeps;
  profileController: BootstrapProfileController;
  currentLessonSimMode: () => "preset-lab" | "binary-lab";
  setRestoringHistory: (restoring: boolean) => void;
  syncModeNavigation: () => void;
  syncBinaryUi: () => void;
  renderDidacticsSurface: () => void;
  invalidate: () => void;
  setAppStatus: (message: string) => void;
  writeProductHistory: (kind: "push" | "replace") => void;
  warnEl: HTMLElement | null;
};

export function workspaceProductControls(refs: UiRefs) {
  return {
    productProfileSelect: refs.productProfileSelect,
    productModeSelect: refs.productModeSelect,
    uiModeSelect: refs.uiModeSelect,
    simModeSelect: refs.simModeSelect,
    runtimeModeSelect: refs.runtimeModeSelect,
    presetSelect: refs.presetSelect,
    presetDesc: refs.presetDesc,
    realSystemSelect: refs.realSystemSelect,
    realSystemMeta: refs.realSystemMeta,
  };
}

function scenarioSettingsFromWorkspace(workspace: WorkspaceDocumentV1): WorkspaceScenarioSettings {
  const { runtime, binaryLab } = workspace.education.scenario;
  return {
    ...(runtime?.referenceSubsteps === undefined ? {} : { referenceSubsteps: runtime.referenceSubsteps }),
    ...(runtime?.executionMode === undefined ? {} : { executionMode: runtime.executionMode }),
    ...(binaryLab?.enabled === undefined ? {} : { binaryLabEnabled: binaryLab.enabled }),
  };
}

function restoreRuntimeModeControl(refs: UiRefs, workspace: WorkspaceDocumentV1): void {
  const mode = workspace.education.scenario.runtime?.mode;
  if (mode && refs.runtimeModeSelect) refs.runtimeModeSelect.value = mode;
}

function restoreGuidedLabState(
  args: RestoreWorkspaceArgs,
  guided: WorkspaceDocumentV1["education"]["guidedLab"],
  corrections: string[],
): void {
  if (!guided) return;
  const learning = { ...guided.learning, passedStepIds: [...guided.learning.passedStepIds] };
  args.state.params.didactics = {
    ...(args.state.params.didactics ?? {}),
    activeLessonId: learning.lessonId,
    hintLevel: guided.hintLevel,
    learningState: learning,
  };
  args.state.didacticsRuntime = { learning, responses: { ...guided.responses } };
  syncDidacticsControlsFromParams(args.state.params, args.refs, args.currentLessonSimMode());
  applyProductLessonSelection(args.refs.didLessonSelect, learning.lessonId, corrections);
  if (!guided.binaryLab) return;
  args.state.binaryLabState = {
    ...args.state.binaryLabState,
    revealed: guided.binaryLab.revealed,
    skyVisible: guided.binaryLab.revealed || !args.state.binaryLabState.hideSkyUntilReveal,
    ...(guided.binaryLab.hypothesis === undefined ? {} : { hypothesis: guided.binaryLab.hypothesis }),
  };
}

function restoreScientificControls(workspace: WorkspaceDocumentV1): void {
  if (!workspace.scientific) return;
  const duration = document.getElementById("scienceDurationHours") as HTMLInputElement | null;
  const cadence = document.getElementById("scienceCadenceSec") as HTMLInputElement | null;
  const seed = document.getElementById("scienceSeed") as HTMLInputElement | null;
  if (!duration || !cadence || !seed) {
    throw new Error("Scientific workspace controls are unavailable.");
  }
  duration.valueAsNumber = workspace.scientific.request.endOffsetSec / 3_600;
  cadence.valueAsNumber = workspace.scientific.request.sampleCadenceSec;
  seed.valueAsNumber = workspace.scientific.request.seed;
}

async function applyRestoredScenario(
  args: RestoreWorkspaceArgs,
  workspace: WorkspaceDocumentV1,
  draft: BrowserScenarioDraft,
): Promise<void> {
  const previousSettings = args.state.workspaceScenarioSettings;
  args.state.workspaceScenarioSettings = scenarioSettingsFromWorkspace(workspace);
  restoreRuntimeModeControl(args.refs, workspace);
  try {
    await applyScenarioParams(args.scenarioDeps, draft, {
      syncUi: true,
      resetNoise: true,
      keepWorkspaceSettings: true,
    });
  } catch (error) {
    args.state.workspaceScenarioSettings = previousSettings;
    throw error;
  }
  args.state.binaryLabState = createBinaryLabState(
    workspace.education.scenario.binaryLab ?? DEFAULT_BINARY_LAB_CONFIG_V4.binaryLab,
  );
}

/**
 * Restores a workspace document; resolves to whether it carried Guided Lab state, because
 * without it the learner's in-memory responses stay and are still unsaved.
 */
export async function restoreWorkspace(args: RestoreWorkspaceArgs, text: string): Promise<boolean> {
  // Parse and convert before changing controls or runtime state so malformed or
  // unrepresentable files leave the live workspace intact.
  const workspace = parseWorkspaceDocumentJson(text);
  if (workspace.scientific && workspace.scientific.request.startOffsetSec !== 0) {
    throw new Error("This website can restore Scientific workspaces only when startOffsetSec is zero.");
  }
  const draft = toBrowserScenarioDraftFromEducationScenarioV4(
    workspace.education.scenario,
    SCENARIO_DEFAULTS,
  );
  await withScenarioApplyGuard(args.applyGuard, args.refs, args.warnEl, async () => {
    const parsed = { state: workspace.productContext, corrections: [] as string[] };
    args.setRestoringHistory(true);
    try {
      applyProductViewControlState(workspaceProductControls(args.refs), parsed);
      args.profileController.syncFromControl();
      restoreScientificControls(workspace);
      syncProductModeVisibility(readProductMode(args.refs.productModeSelect.value));
      syncUiModeVisibility(readUiMode(args.refs.uiModeSelect.value));
      args.syncModeNavigation();
      await applyRestoredScenario(args, workspace, draft);
      // After the scenario apply, so the restored request is pinned to the restored scenario.
      args.profileController.restoreScientificRequest(workspace.scientific?.request);
      restoreGuidedLabState(args, workspace.education.guidedLab, parsed.corrections);
      args.syncBinaryUi();
      args.renderDidacticsSurface();
      args.invalidate();
      args.setAppStatus(
        parsed.corrections.length > 0
          ? `Workspace restored with corrections. ${parsed.corrections.join(" ")}`
          : "Workspace restored. Transient histories and playback time were reset.",
      );
    } finally {
      args.setRestoringHistory(false);
    }
    args.writeProductHistory("replace");
  });
  return workspace.education.guidedLab !== undefined;
}
