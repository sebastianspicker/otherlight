import type { LessonSimMode, SystemParams } from "../core/types";
import { cloneParams } from "./scenario";
import { buildBinaryLabParams, DEFAULT_BINARY_LAB_CONFIG_V4 } from "./binaryLab";
import { getPresetById } from "./presets";
import { buildParamsFromRealSystem, formatRealSystemMeta, getRealSystemById } from "./realSystems";
import { stripUnsupportedPhotometryForV4Runtime } from "./v4Runtime";
import type { UiRefs } from "../ui/refs";
import { setHidden } from "../core/dom";
import { loadParamsIntoUI } from "../ui/params";
import { syncAllEnableStates } from "../ui/enable";
import { applyObserverModeContract, readUiMode } from "../ui/mode";
import { readProductMode } from "../ui/productMode";
import { syncQuickControlsFromInputs } from "../ui/quickControls";
import { syncSliderMirrorsFromInputs } from "./actions";
import { ensureDidacticsConfig, initDidacticsRuntime, syncDidacticsControlsFromParams } from "./didactics";
import { syncNoiseStateFromParams, type NoiseState } from "./noise";
import {
  canEditParams,
  canRevealSky,
  createBinaryLabState,
  type BinaryLabHypothesis,
  type BinaryLabState,
} from "../didactics/binaryLab";
import type { DidacticsRuntimeState } from "./didactics";

export const BINARY_MODE_VALUE = "binary-lab";
export const PRESET_MODE_VALUE = "preset-lab";
export const LAB_PRODUCT_MODE_VALUE = "lab";
export const SIMULATION_PRODUCT_MODE_VALUE = "simulation";
const BINARY_HYPOTHESIS_VALUES: BinaryLabHypothesis[] = [
  "primary-eclipse-deepest",
  "secondary-eclipse-dominates",
  "eccentricity-shifts-eclipse-spacing",
];

export type ScenarioFlowState = {
  scenarioDefaults: SystemParams;
  params: SystemParams;
  didacticsRuntime: DidacticsRuntimeState;
  noise: NoiseState;
  binaryLabState: BinaryLabState;
};

export type ScenarioFlowDeps = {
  refs: UiRefs;
  state: ScenarioFlowState;
  getTimeSec: () => number;
  rebuildSimulationFromParams: () => Promise<void>;
  resetSimTimeAndLC: (opts?: { resetNoise?: boolean }) => void;
};

export type ScenarioApplyGuard = {
  applying: boolean;
  pendingRun?: (() => Promise<void>) | null;
};

export type ApplyScenarioParamsOptions = {
  syncUi?: boolean;
  resetNoise?: boolean;
};

export function isBinaryHypothesis(value: string): value is BinaryLabHypothesis {
  return BINARY_HYPOTHESIS_VALUES.includes(value as BinaryLabHypothesis);
}

export function isLabProductModeActive(refs: UiRefs): boolean {
  return readProductMode(refs.productModeSelect?.value) === LAB_PRODUCT_MODE_VALUE;
}

export function isBinaryModeActive(refs: UiRefs): boolean {
  return (
    isLabProductModeActive(refs) && (refs.simModeSelect?.value ?? PRESET_MODE_VALUE) === BINARY_MODE_VALUE
  );
}

function activeLessonSimMode(refs: UiRefs): LessonSimMode {
  return isBinaryModeActive(refs) ? "binary-lab" : "preset-lab";
}

function lockParameterPanel(locked: boolean): void {
  const form = document.getElementById("paramForm");
  if (!form) return;
  const controls = form.querySelectorAll<
    HTMLInputElement | HTMLSelectElement | HTMLButtonElement | HTMLTextAreaElement
  >("input, select, button, textarea");
  for (const ctrl of controls) ctrl.disabled = locked;
}

function syncBinaryModeSurfaceVisibility(active: boolean): void {
  const paramForm = document.getElementById("paramForm");
  const binaryLabParamNotice = document.getElementById("binaryLabParamNotice");
  const ocSection = document.getElementById("ocSection");

  if (paramForm) setHidden(paramForm, active);
  if (binaryLabParamNotice) setHidden(binaryLabParamNotice, !active);
  if (ocSection) setHidden(ocSection, active);
}

export function syncBinaryLabUiState(refs: UiRefs, binaryLabState: BinaryLabState): void {
  const active = isBinaryModeActive(refs);
  const skyVisible = !active || binaryLabState.skyVisible;
  const canEdit = !active || canEditParams(binaryLabState);
  const canReveal = active && canRevealSky(binaryLabState) && !binaryLabState.revealed;
  syncBinaryModeSurfaceVisibility(active);
  if (refs.didBinaryControls) refs.didBinaryControls.hidden = !active;
  if (refs.didHypothesisSelect) refs.didHypothesisSelect.disabled = !active;
  if (refs.didRevealSkyBtn) refs.didRevealSkyBtn.disabled = !canReveal;
  if (refs.skyBlackboxHint) refs.skyBlackboxHint.hidden = skyVisible;
  refs.skyCanvas.style.visibility = skyVisible ? "visible" : "hidden";
  lockParameterPanel(!canEdit);
  // After unlocking, re-apply feature toggle states so that controls disabled
  // by their parent feature (e.g. moon inputs when moon is off) stay disabled.
  if (canEdit) {
    syncAllEnableStates(refs);
  }
}

function setScenarioApplyBusy(refs: UiRefs, busy: boolean, statusEl?: HTMLElement | null): void {
  const controls: Array<HTMLElement | null> = [
    refs.simModeSelect,
    refs.runtimeModeSelect,
    refs.presetSelect,
    refs.realSystemSelect,
    refs.btnApplyParams,
    refs.btnResetParams,
    refs.btnStart,
    refs.btnReset,
    refs.btnClearLC,
  ];
  for (const el of controls) {
    if (!el) continue;
    if ("disabled" in el) (el as HTMLButtonElement | HTMLInputElement | HTMLSelectElement).disabled = busy;
  }
  const main = document.getElementById("main");
  if (main) main.setAttribute("aria-busy", busy ? "true" : "false");
  if (busy && statusEl) statusEl.textContent = "Applying scenario...";
}

export async function withScenarioApplyGuard(
  guard: ScenarioApplyGuard,
  refs: UiRefs,
  statusEl: HTMLElement | null | undefined,
  run: () => Promise<void>,
): Promise<void> {
  if (guard.applying) {
    guard.pendingRun = run;
    return;
  }
  guard.applying = true;
  setScenarioApplyBusy(refs, true, statusEl ?? null);
  let currentRun: (() => Promise<void>) | null = run;
  try {
    while (currentRun) {
      guard.pendingRun = null;
      await currentRun();
      currentRun = guard.pendingRun ?? null;
    }
  } finally {
    guard.applying = false;
    guard.pendingRun = null;
    setScenarioApplyBusy(refs, false);
  }
}

async function applyPresetById(deps: ScenarioFlowDeps, id: string): Promise<void> {
  const { state, refs } = deps;
  const preset = getPresetById(id);
  state.scenarioDefaults = stripUnsupportedPhotometryForV4Runtime(preset.params);
  refs.presetDesc.textContent = preset.description;
  await applyScenarioParams(deps, state.scenarioDefaults);
}

async function applyRealSystemById(deps: ScenarioFlowDeps, id: string): Promise<void> {
  const { state, refs } = deps;
  const entry = getRealSystemById(id);
  if (!entry) return;
  state.scenarioDefaults = stripUnsupportedPhotometryForV4Runtime(buildParamsFromRealSystem(id));
  if (refs.realSystemMeta) refs.realSystemMeta.textContent = formatRealSystemMeta(entry);
  await applyScenarioParams(deps, state.scenarioDefaults);
}

async function applyBinaryLabScenario(deps: ScenarioFlowDeps): Promise<void> {
  const { state, refs } = deps;
  state.scenarioDefaults = stripUnsupportedPhotometryForV4Runtime(
    buildBinaryLabParams(DEFAULT_BINARY_LAB_CONFIG_V4),
  );
  state.params = ensureDidacticsConfig(cloneParams(state.scenarioDefaults));
  state.didacticsRuntime = initDidacticsRuntime(state.params, deps.getTimeSec());
  state.binaryLabState = createBinaryLabState(DEFAULT_BINARY_LAB_CONFIG_V4.binaryLab);
  if (refs.realSystemSelect) refs.realSystemSelect.value = "";
  if (refs.realSystemMeta) refs.realSystemMeta.textContent = "";
  if (refs.didHypothesisSelect) refs.didHypothesisSelect.value = "";
  refs.presetDesc.textContent = "Binary lab (detached eclipsing): black-box flow with hypothesis gating.";
  await applyScenarioParams(deps, state.scenarioDefaults);
}

export async function applyScenarioParams(
  deps: ScenarioFlowDeps,
  nextParams: SystemParams,
  options: ApplyScenarioParamsOptions = {},
): Promise<void> {
  const { state, refs } = deps;
  state.params = ensureDidacticsConfig(cloneParams(nextParams));
  applyObserverModeContract(state.params, readUiMode(refs.uiModeSelect.value));
  state.didacticsRuntime = initDidacticsRuntime(state.params, deps.getTimeSec());
  if (options.syncUi !== false) {
    loadParamsIntoUI(state.params, refs);
    syncAllEnableStates(refs);
    syncQuickControlsFromInputs(refs);
    syncSliderMirrorsFromInputs();
    syncDidacticsControlsFromParams(state.params, refs, activeLessonSimMode(refs));
  } else {
    syncAllEnableStates(refs);
    syncQuickControlsFromInputs(refs);
  }
  state.noise = syncNoiseStateFromParams(state.noise, state.params);
  await deps.rebuildSimulationFromParams();
  deps.resetSimTimeAndLC({ resetNoise: options.resetNoise ?? true });
  syncBinaryLabUiState(refs, state.binaryLabState);
}

export async function applyActiveScenarioForMode(deps: ScenarioFlowDeps): Promise<void> {
  const { refs } = deps;
  if (!isLabProductModeActive(refs)) {
    const realId = refs.realSystemSelect?.value ?? "";
    if (realId) {
      await applyRealSystemById(deps, realId);
      return;
    }
    await applyPresetById(deps, refs.presetSelect.value);
    return;
  }
  if (isBinaryModeActive(refs)) {
    await applyBinaryLabScenario(deps);
    return;
  }
  if (refs.realSystemSelect) refs.realSystemSelect.value = "";
  if (refs.realSystemMeta) refs.realSystemMeta.textContent = "";
  await applyPresetById(deps, refs.presetSelect.value);
}
