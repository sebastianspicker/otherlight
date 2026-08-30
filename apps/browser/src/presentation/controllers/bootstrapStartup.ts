/**
 * Owns bootstrap startup finalization within the app layer.
 * Keeps application bootstrap and frame orchestration composable.
 */
import type { UiRefs } from "../ui/refs";
import { applyProductLessonSelection } from "./bootstrapProductSetup";
import { uiWarningText } from "../../application/warnings";
import type { ScenarioFlowState } from "./scenarioFlow";

export type BootstrapStartupDeps = {
  refs: UiRefs;
  state: Pick<ScenarioFlowState, "params">;
  warnEl: HTMLElement | null;
  initialLesson: string;
  corrections: string[];
  applyActive: () => Promise<void>;
  setRestoringHistory: (restoring: boolean) => void;
  renderDidacticsSurface: () => void;
  syncBinaryUi: () => void;
  renderOcPanel: () => void;
  isDisposed: () => boolean;
  startFrame: () => void;
  writeProductHistory: (kind: "push" | "replace") => void;
  setAppStatus: (message: string) => void;
};

export async function finalizeBootstrapStartup(deps: BootstrapStartupDeps): Promise<void> {
  const {
    refs,
    state,
    warnEl,
    initialLesson,
    corrections,
    applyActive,
    setRestoringHistory,
    renderDidacticsSurface,
    syncBinaryUi,
    renderOcPanel,
    isDisposed,
    startFrame,
    writeProductHistory,
    setAppStatus,
  } = deps;

  try {
    await applyActive();
    if (warnEl) warnEl.textContent = uiWarningText(state.params) ?? "";
    if (applyProductLessonSelection(refs.didLessonSelect, initialLesson, corrections)) {
      setRestoringHistory(true);
      refs.didLessonSelect?.dispatchEvent(new Event("change", { bubbles: true }));
      setRestoringHistory(false);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (warnEl) warnEl.textContent = `Startup: ${msg}`;
  }
  renderDidacticsSurface();
  syncBinaryUi();
  renderOcPanel();
  if (!isDisposed()) {
    startFrame();
    writeProductHistory("replace");
    if (corrections.length > 0) {
      setAppStatus(`Some shared settings were corrected. ${corrections.join(" ")}`);
    } else {
      setAppStatus("Ready. Current context is reflected in the shareable URL.");
    }
  }
}
