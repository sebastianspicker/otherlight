/**
 * Owns bootstrap reset / param-form handlers within the app layer.
 * Keeps application bootstrap and frame orchestration composable.
 */
import { clearParamValidationUi } from "../ui/params";
import type { UiRefs } from "../ui/refs";
import { runWithErrorHandling } from "./runWithErrorHandling";
import {
  applyScenarioParams,
  isBinaryModeActive,
  withScenarioApplyGuard,
  type ScenarioApplyGuard,
  type ScenarioFlowDeps,
  type ScenarioFlowState,
} from "./scenarioFlow";
import { uiWarningText } from "./warnings";

type ResetHandlerState = Pick<ScenarioFlowState, "params" | "scenarioDefaults" | "binaryLabState"> & {
  running: boolean;
};

export type BootstrapResetHandlersDeps = {
  refs: UiRefs;
  state: ResetHandlerState;
  paramForm: HTMLFormElement | null;
  paramErrorSummary: HTMLElement | null;
  btnStart: HTMLButtonElement;
  btnReset: HTMLButtonElement;
  btnResetParams: HTMLButtonElement;
  applyGuard: ScenarioApplyGuard;
  scenarioDeps: ScenarioFlowDeps;
  applyCurrentUiParams: (resetNoise?: boolean) => Promise<void>;
  setParamsDirty: (dirty: boolean) => void;
  syncBinaryUi: () => void;
  setRunning: (running: boolean) => void;
  resetSimTimeAndLC: (opts?: { resetNoise?: boolean }) => void;
  warnEl: HTMLElement | null;
  signal: AbortSignal;
};

export function wireBootstrapResetHandlers(deps: BootstrapResetHandlersDeps): void {
  const {
    refs,
    state,
    paramForm,
    paramErrorSummary,
    btnStart,
    btnReset,
    btnResetParams,
    applyGuard,
    scenarioDeps,
    applyCurrentUiParams,
    setParamsDirty,
    syncBinaryUi,
    setRunning,
    resetSimTimeAndLC,
    warnEl,
    signal,
  } = deps;
  const listenerOptions: AddEventListenerOptions = { signal };

  btnStart.addEventListener("click", () => setRunning(!state.running), listenerOptions);
  btnReset.addEventListener("click", () => resetSimTimeAndLC({ resetNoise: true }), listenerOptions);

  paramForm?.addEventListener(
    "submit",
    (event) => {
      event.preventDefault();
      runWithErrorHandling(() => applyCurrentUiParams(true), {
        statusEl: warnEl,
        getSuccessMessage: () => uiWarningText(state.params) ?? "",
      });
    },
    listenerOptions,
  );

  btnResetParams.addEventListener(
    "click",
    () => {
      if (isBinaryModeActive(refs) && !state.binaryLabState.hypothesis) {
        if (warnEl) warnEl.textContent = "Set a hypothesis first to unlock parameter editing.";
        return;
      }
      runWithErrorHandling(
        () =>
          withScenarioApplyGuard(applyGuard, refs, warnEl, async () => {
            await applyScenarioParams(scenarioDeps, state.scenarioDefaults, {
              syncUi: true,
              resetNoise: true,
            });
            if (paramForm) clearParamValidationUi(paramForm, paramErrorSummary);
            setParamsDirty(false);
            syncBinaryUi();
          }),
        { statusEl: warnEl, getSuccessMessage: () => uiWarningText(state.params) ?? "" },
      );
    },
    listenerOptions,
  );
}
