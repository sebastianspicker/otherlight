/**
 * Owns bootstrap Scenario / product-mode control wiring within the app layer.
 * Keeps application bootstrap and frame orchestration composable.
 */
import { applyObserverModeContract, readUiMode, syncUiModeVisibility } from "../ui/mode";
import { readProductMode, syncProductModeVisibility } from "../ui/productMode";
import type { UiRefs } from "../ui/refs";
import { runWithErrorHandling } from "./runWithErrorHandling";
import {
  applyScenarioParams,
  isLabProductModeActive,
  LAB_PRODUCT_MODE_VALUE,
  PRESET_MODE_VALUE,
  SIMULATION_PRODUCT_MODE_VALUE,
  withScenarioApplyGuard,
  type ScenarioApplyGuard,
  type ScenarioFlowDeps,
  type ScenarioFlowState,
} from "./scenarioFlow";
import { uiWarningText } from "../../application/warnings";

type ScenarioControlState = Pick<ScenarioFlowState, "params">;

export type BootstrapScenarioControlsDeps = {
  refs: UiRefs;
  state: ScenarioControlState;
  productModeSelect: HTMLSelectElement;
  uiModeSelect: HTMLSelectElement;
  simModeSelect: HTMLSelectElement | null;
  runtimeModeSelect: HTMLSelectElement | null;
  presetSelect: HTMLSelectElement;
  realSystemSelect: HTMLSelectElement | null;
  realSystemMeta: HTMLElement | null;
  modeSimulationBtn: HTMLButtonElement | null;
  modeLabBtn: HTMLButtonElement | null;
  applyGuard: ScenarioApplyGuard;
  scenarioDeps: ScenarioFlowDeps;
  applyActive: () => Promise<void>;
  rebuildSimulationFromParams: () => Promise<void>;
  resetSimTimeAndLC: (opts?: { resetNoise?: boolean }) => void;
  syncBinaryUi: () => void;
  syncModeNavigation: () => void;
  writeProductHistory: (kind: "push" | "replace") => void;
  setAppStatus: (message: string) => void;
  renderDidacticsSurface: () => void;
  requestContextChange: (action: () => void) => void;
  /** Mutable holder so debug DOM can be wired after these listeners. */
  syncDebugDom: { current: () => void };
  warnEl: HTMLElement | null;
  signal: AbortSignal;
};

export function wireBootstrapScenarioControls(deps: BootstrapScenarioControlsDeps): void {
  const {
    refs,
    state,
    productModeSelect,
    uiModeSelect,
    simModeSelect,
    runtimeModeSelect,
    presetSelect,
    realSystemSelect,
    realSystemMeta,
    modeSimulationBtn,
    modeLabBtn,
    applyGuard,
    scenarioDeps,
    applyActive,
    rebuildSimulationFromParams,
    resetSimTimeAndLC,
    syncBinaryUi,
    syncModeNavigation,
    writeProductHistory,
    setAppStatus,
    renderDidacticsSurface,
    requestContextChange,
    syncDebugDom,
    warnEl,
    signal,
  } = deps;
  const listenerOptions: AddEventListenerOptions = { signal };

  syncProductModeVisibility(readProductMode(productModeSelect.value));
  syncUiModeVisibility(readUiMode(uiModeSelect.value));

  uiModeSelect.addEventListener(
    "change",
    () => {
      const nextMode = readUiMode(uiModeSelect.value);
      syncUiModeVisibility(nextMode);
      syncDebugDom.current();
      writeProductHistory("replace");

      if (nextMode !== "normal") return;

      if (runtimeModeSelect) runtimeModeSelect.value = "realtime";
      runWithErrorHandling(
        () =>
          withScenarioApplyGuard(applyGuard, refs, warnEl, async () => {
            applyObserverModeContract(state.params, nextMode);
            await applyScenarioParams(scenarioDeps, state.params, { syncUi: true, resetNoise: false });
            syncBinaryUi();
          }),
        { statusEl: warnEl, getSuccessMessage: () => uiWarningText(state.params) ?? "" },
      );
    },
    listenerOptions,
  );

  productModeSelect.addEventListener(
    "change",
    () => {
      const nextProductMode = readProductMode(productModeSelect.value);
      syncProductModeVisibility(nextProductMode);
      syncModeNavigation();
      writeProductHistory("push");
      setAppStatus(
        nextProductMode === "lab" ? "Guided Labs workspace selected." : "Simulation workspace selected.",
      );
      if (nextProductMode === LAB_PRODUCT_MODE_VALUE) {
        uiModeSelect.value = "normal";
        syncUiModeVisibility("normal");
        syncDebugDom.current();
        if (runtimeModeSelect) runtimeModeSelect.value = "realtime";
        if (simModeSelect && !simModeSelect.value) simModeSelect.value = PRESET_MODE_VALUE;
      }
      renderDidacticsSurface();
      runWithErrorHandling(() => applyActive(), {
        statusEl: warnEl,
        getSuccessMessage: () => uiWarningText(state.params) ?? "",
      });
    },
    listenerOptions,
  );

  modeSimulationBtn?.addEventListener(
    "click",
    () => {
      if (productModeSelect.value === "simulation") return;
      requestContextChange(() => {
        productModeSelect.value = "simulation";
        productModeSelect.dispatchEvent(new Event("change", { bubbles: true }));
      });
    },
    listenerOptions,
  );

  modeLabBtn?.addEventListener(
    "click",
    () => {
      if (productModeSelect.value === "lab") return;
      requestContextChange(() => {
        productModeSelect.value = "lab";
        productModeSelect.dispatchEvent(new Event("change", { bubbles: true }));
      });
    },
    listenerOptions,
  );

  presetSelect.addEventListener(
    "change",
    () => {
      if (productModeSelect.value !== SIMULATION_PRODUCT_MODE_VALUE) {
        productModeSelect.value = SIMULATION_PRODUCT_MODE_VALUE;
        syncProductModeVisibility("simulation");
      }
      if (realSystemSelect) realSystemSelect.value = "";
      if (realSystemMeta) realSystemMeta.textContent = "";
      syncModeNavigation();
      writeProductHistory("push");
      runWithErrorHandling(() => applyActive(), {
        statusEl: warnEl,
        getSuccessMessage: () => uiWarningText(state.params) ?? "",
      });
    },
    listenerOptions,
  );

  if (realSystemSelect) {
    realSystemSelect.addEventListener(
      "change",
      () => {
        if (productModeSelect.value !== SIMULATION_PRODUCT_MODE_VALUE) {
          productModeSelect.value = SIMULATION_PRODUCT_MODE_VALUE;
          syncProductModeVisibility("simulation");
        }
        if (!realSystemSelect.value && realSystemMeta) realSystemMeta.textContent = "";
        syncModeNavigation();
        writeProductHistory("push");
        runWithErrorHandling(() => applyActive(), {
          statusEl: warnEl,
          getSuccessMessage: () => uiWarningText(state.params) ?? "",
        });
      },
      listenerOptions,
    );
  }

  if (simModeSelect) {
    simModeSelect.addEventListener(
      "change",
      () => {
        if (!isLabProductModeActive(refs)) {
          productModeSelect.value = LAB_PRODUCT_MODE_VALUE;
          syncProductModeVisibility("lab");
          uiModeSelect.value = "normal";
          syncUiModeVisibility("normal");
        }
        syncModeNavigation();
        writeProductHistory("push");
        runWithErrorHandling(() => applyActive(), {
          statusEl: warnEl,
          getSuccessMessage: () => uiWarningText(state.params) ?? "",
        });
      },
      listenerOptions,
    );
  }

  if (runtimeModeSelect) {
    runtimeModeSelect.addEventListener(
      "change",
      () => {
        writeProductHistory("replace");
        runWithErrorHandling(
          () =>
            withScenarioApplyGuard(applyGuard, refs, warnEl, async () => {
              await rebuildSimulationFromParams();
              resetSimTimeAndLC({ resetNoise: false });
            }),
          { statusEl: warnEl, getSuccessMessage: () => uiWarningText(state.params) ?? "" },
        );
      },
      listenerOptions,
    );
  }
}
