/** Restores validated workspace documents without broadening bootstrap persistence wiring. */

import { toBrowserScenarioDraftFromEducationScenarioV4 } from "../../domain/simulation/v4";
import { SCENARIO_DEFAULTS } from "../../application/catalog/defaults";
import { readUiMode, syncUiModeVisibility } from "../ui/mode";
import { readProductMode, syncProductModeVisibility } from "../ui/productMode";
import type { UiRefs } from "../ui/refs";
import {
  parseWorkspaceDocumentJson,
  type WorkspaceDocumentV1,
} from "../../infrastructure/workspace/workspaceDocument";
import { syncDidacticsControlsFromParams } from "./didactics";
import { applyProductLessonSelection, applyProductViewControlState } from "./bootstrapProductSetup";
import type { BootstrapProfileController } from "./bootstrapProfile";
import {
  applyScenarioParams,
  withScenarioApplyGuard,
  type ScenarioApplyGuard,
  type ScenarioFlowDeps,
  type ScenarioFlowState,
} from "./scenarioFlow";

type RestoreState = Pick<ScenarioFlowState, "params" | "didacticsRuntime" | "binaryLabState">;

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

export async function restoreWorkspace(args: RestoreWorkspaceArgs, text: string): Promise<void> {
  // Parse before changing controls or runtime state so malformed files leave the live workspace intact.
  const workspace = parseWorkspaceDocumentJson(text);
  if (workspace.scientific && workspace.scientific.request.startOffsetSec !== 0) {
    throw new Error("This website can restore Scientific workspaces only when startOffsetSec is zero.");
  }
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
      await applyScenarioParams(
        args.scenarioDeps,
        toBrowserScenarioDraftFromEducationScenarioV4(workspace.education.scenario, SCENARIO_DEFAULTS),
        {
          syncUi: true,
          resetNoise: true,
        },
      );
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
}
