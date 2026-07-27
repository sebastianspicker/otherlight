/**
 * Owns bootstrap Apply Params / scenario apply helpers within the app layer.
 * Keeps application bootstrap and frame orchestration composable.
 */
import { clearParamValidationUi, readValidatedUIIntoParams, renderParamValidationErrors } from "../ui/params";
import { readUiMode } from "../ui/mode";
import type { UiRefs } from "../ui/refs";
import { runWithErrorHandling } from "./runWithErrorHandling";
import { replaceRuntime, takeRuntimeStatus } from "./runtimeLifecycle";
import {
  applyActiveScenarioForMode,
  applyScenarioParams,
  isBinaryModeActive,
  syncBinaryLabUiState,
  withScenarioApplyGuard,
  type ScenarioApplyGuard,
  type ScenarioFlowDeps,
  type ScenarioFlowState,
} from "./scenarioFlow";
import type { AppSimulationRuntime } from "./v4Runtime";
import { uiWarningText } from "./warnings";

export type BootstrapApplyParamsDeps = {
  refs: UiRefs;
  state: ScenarioFlowState;
  getTimeSec: () => number;
  getSimulation: () => AppSimulationRuntime;
  setSimulation: (next: AppSimulationRuntime) => void;
  isDisposed: () => boolean;
  runtimeArgsFromCurrentParams: () => Parameters<typeof replaceRuntime>[1];
  resetSimTimeAndLC: (opts?: { resetNoise?: boolean }) => void;
  syncDisplayFluxState: () => void;
  setParamsDirty: (dirty: boolean) => void;
  setAppStatus: (message: string) => void;
  warnEl: HTMLElement | null;
  appRetryBtn: HTMLButtonElement | null;
  paramForm: HTMLFormElement | null;
  paramErrorSummary: HTMLElement | null;
  uiModeSelect: HTMLSelectElement;
  signal: AbortSignal;
};

export type BootstrapApplyParamsController = {
  scenarioDeps: ScenarioFlowDeps;
  applyGuard: ScenarioApplyGuard;
  rebuildSimulationFromParams: () => Promise<void>;
  applyActive: () => Promise<void>;
  applyCurrentUiParams: (resetNoise?: boolean) => Promise<void>;
  scheduleNormalModeQuickApply: () => void;
  syncBinaryUi: () => void;
  clearQuickApplyTimer: () => void;
};

export function createBootstrapApplyParams(deps: BootstrapApplyParamsDeps): BootstrapApplyParamsController {
  const {
    refs,
    state,
    getTimeSec,
    getSimulation,
    setSimulation,
    isDisposed,
    runtimeArgsFromCurrentParams,
    resetSimTimeAndLC,
    syncDisplayFluxState,
    setParamsDirty,
    setAppStatus,
    warnEl,
    appRetryBtn,
    paramForm,
    paramErrorSummary,
    uiModeSelect,
    signal,
  } = deps;

  const applyGuard: ScenarioApplyGuard = { applying: false };
  let quickApplyTimer: ReturnType<typeof setTimeout> | null = null;
  let retryScenario: (() => Promise<void>) | null = null;

  const scenarioDeps: ScenarioFlowDeps = {
    refs,
    state,
    getTimeSec,
    rebuildSimulationFromParams,
    resetSimTimeAndLC,
  };

  function syncBinaryUi(): void {
    syncBinaryLabUiState(refs, state.binaryLabState);
  }

  async function rebuildSimulationFromParams(): Promise<void> {
    if (isDisposed()) return;
    const nextSimulation = await replaceRuntime(getSimulation(), runtimeArgsFromCurrentParams());
    if (isDisposed()) {
      nextSimulation.dispose();
      return;
    }
    setSimulation(nextSimulation);
    syncDisplayFluxState();
    const status = takeRuntimeStatus(getSimulation());
    if (status && warnEl) warnEl.textContent = status;
  }

  async function applyActive(): Promise<void> {
    if (isDisposed()) return;
    try {
      await withScenarioApplyGuard(applyGuard, refs, warnEl, async () => {
        await applyActiveScenarioForMode(scenarioDeps);
        syncBinaryUi();
      });
      retryScenario = null;
      if (appRetryBtn) appRetryBtn.hidden = true;
    } catch (error) {
      retryScenario = applyActive;
      if (appRetryBtn) appRetryBtn.hidden = false;
      setAppStatus(
        "The selected scenario could not be loaded. The last valid simulation is preserved; retry is available.",
      );
      throw error;
    }
  }

  async function applyCurrentUiParams(resetNoise = true): Promise<void> {
    if (isDisposed()) return;
    if (isBinaryModeActive(refs) && !state.binaryLabState.hypothesis) {
      if (warnEl) warnEl.textContent = "Set a hypothesis first to unlock parameter editing.";
      return;
    }
    await withScenarioApplyGuard(applyGuard, refs, warnEl, async () => {
      if (!paramForm) throw new Error("Parameter form is unavailable.");
      const result = readValidatedUIIntoParams(state.params, refs, state.scenarioDefaults, paramForm);
      if (!result.ok) {
        renderParamValidationErrors(paramForm, result.errors, paramErrorSummary);
        throw new Error(
          `Parameters were not applied. Fix ${result.errors.length} highlighted ${result.errors.length === 1 ? "error" : "errors"}.`,
        );
      }
      await applyScenarioParams(scenarioDeps, result.params, { syncUi: false, resetNoise });
      clearParamValidationUi(paramForm, paramErrorSummary);
      setParamsDirty(false);
      syncBinaryUi();
    });
  }

  function scheduleNormalModeQuickApply(): void {
    if (isDisposed()) return;
    if (readUiMode(uiModeSelect.value) !== "normal") return;
    if (quickApplyTimer !== null) clearTimeout(quickApplyTimer);
    quickApplyTimer = setTimeout(() => {
      quickApplyTimer = null;
      if (isDisposed()) return;
      runWithErrorHandling(() => applyCurrentUiParams(true), {
        statusEl: warnEl,
        getSuccessMessage: () => uiWarningText(state.params) ?? "",
      });
    }, 120);
  }

  function clearQuickApplyTimer(): void {
    if (quickApplyTimer !== null) {
      clearTimeout(quickApplyTimer);
      quickApplyTimer = null;
    }
  }

  appRetryBtn?.addEventListener(
    "click",
    () => {
      if (!retryScenario) return;
      runWithErrorHandling(() => retryScenario?.(), {
        statusEl: warnEl,
        getSuccessMessage: () => uiWarningText(state.params) ?? "Scenario loaded.",
        errorPrefix: "Retry failed: ",
      });
    },
    { signal },
  );

  return {
    scenarioDeps,
    applyGuard,
    rebuildSimulationFromParams,
    applyActive,
    applyCurrentUiParams,
    scheduleNormalModeQuickApply,
    syncBinaryUi,
    clearQuickApplyTimer,
  };
}
