/**
 * Owns scenario Flow support within the app layer. Keeps application bootstrap and frame orchestration composable.
 */
import type { LessonSimMode, BrowserScenarioDraft } from "../../domain/model/types";
import { getLabSystemByControlValue, getLabSystemById } from "../../domain/model/labs";
import { cloneParams } from "../../application/scenario";
import { buildBinaryLabParams, DEFAULT_BINARY_LAB_CONFIG_V4 } from "../../application/binaryLab";
import { getPresetById } from "../../application/presets";
import {
  buildParamsFromRealSystem,
  formatRealSystemMeta,
  getRealSystemById,
} from "../../application/realSystems";
import type { UiRefs } from "../ui/refs";
import { setHidden } from "../ui/dom";
import { loadParamsIntoUI } from "../ui/params";
import { syncAllEnableStates } from "../ui/enable";
import { applyObserverModeContract, readUiMode } from "../ui/mode";
import { readProductMode } from "../ui/productMode";
import { syncQuickControlsFromInputs } from "../ui/quickControls";
import { syncSliderMirrorsFromInputs } from "./actions";
import { ensureDidacticsConfig, initDidacticsRuntime, syncDidacticsControlsFromParams } from "./didactics";
import { syncNoiseStateFromParams, type NoiseState } from "../../application/noise";
import {
  canEditParams,
  canRevealSky,
  createBinaryLabState,
  type BinaryLabHypothesis,
  type BinaryLabState,
} from "../../domain/education/binaryLab";
import type { DidacticsRuntimeState } from "./didactics";
import type {
  LightCurveBadge,
  LightCurveComparisonInset,
  LightCurveOverlaySeries,
} from "../render/lightCurvePlotTypes";
import type { SceneGhostGeometry } from "../render/sceneTypes";

export const BINARY_MODE_VALUE = getLabSystemById("binary-stars").controlValue;
export const PRESET_MODE_VALUE = getLabSystemById("transit-exomoon").controlValue;
export const LAB_PRODUCT_MODE_VALUE = "lab";
export const SIMULATION_PRODUCT_MODE_VALUE = "simulation";
const BINARY_HYPOTHESIS_VALUES: BinaryLabHypothesis[] = [
  "primary-eclipse-deepest",
  "secondary-eclipse-dominates",
  "eccentricity-shifts-eclipse-spacing",
];

export type ScenarioFlowState = {
  scenarioDefaults: BrowserScenarioDraft;
  params: BrowserScenarioDraft;
  didacticsRuntime: DidacticsRuntimeState;
  noise: NoiseState;
  binaryLabState: BinaryLabState;
  comparisonCurveSeries?: LightCurveOverlaySeries[];
  comparisonInset?: LightCurveComparisonInset;
  comparisonGhosts?: SceneGhostGeometry[];
  comparisonBadges?: LightCurveBadge[];
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

type BinaryLabUiStatus = {
  active: boolean;
  skyVisible: boolean;
  canEdit: boolean;
  canReveal: boolean;
};

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
  const status = resolveBinaryLabUiStatus(refs, binaryLabState);
  syncBinaryModeSurfaceVisibility(status.active);
  syncBinaryLabControls(refs, status);
  syncBinaryLabSky(refs, status);
  lockParameterPanel(!status.canEdit);
  // After unlocking, re-apply feature toggle states so that controls disabled
  // by their parent feature (e.g. moon inputs when moon is off) stay disabled.
  if (status.canEdit) {
    syncAllEnableStates(refs);
  }
}

function resolveBinaryLabUiStatus(refs: UiRefs, binaryLabState: BinaryLabState): BinaryLabUiStatus {
  const active = isBinaryModeActive(refs);
  return {
    active,
    skyVisible: !active || binaryLabState.skyVisible,
    canEdit: !active || canEditParams(binaryLabState),
    canReveal: active && canRevealSky(binaryLabState) && !binaryLabState.revealed,
  };
}

const syncBinaryLabControls = (refs: UiRefs, status: BinaryLabUiStatus): void => {
  setOptionalHidden(refs.didBinaryControls, !status.active);
  setOptionalDisabled(refs.didHypothesisSelect, !status.active);
  setOptionalDisabled(refs.didRevealSkyBtn, !status.canReveal);
};

function setOptionalHidden(el: HTMLElement | null | undefined, hidden: boolean): void {
  if (el) el.hidden = hidden;
}

function setOptionalDisabled(
  el: HTMLButtonElement | HTMLSelectElement | null | undefined,
  disabled: boolean,
): void {
  if (el) el.disabled = disabled;
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
  // UI changes can arrive while a runtime rebuild is still preparing. Keep the
  // current rebuild serialized and remember only the latest requested follow-up.
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
  const previousDefaults = state.scenarioDefaults;
  const previousDescription = refs.presetDesc.textContent;
  state.scenarioDefaults = cloneParams(preset.params);
  refs.presetDesc.textContent = preset.description;
  try {
    await applyScenarioParams(deps, state.scenarioDefaults);
  } catch (error) {
    state.scenarioDefaults = previousDefaults;
    refs.presetDesc.textContent = previousDescription;
    throw error;
  }
}

async function applyRealSystemById(deps: ScenarioFlowDeps, id: string): Promise<void> {
  const { state, refs } = deps;
  const entry = getRealSystemById(id);
  if (!entry) return;
  const previousDefaults = state.scenarioDefaults;
  const previousMeta = refs.realSystemMeta?.textContent ?? "";
  state.scenarioDefaults = cloneParams(buildParamsFromRealSystem(id));
  if (refs.realSystemMeta) refs.realSystemMeta.textContent = formatRealSystemMeta(entry);
  try {
    await applyScenarioParams(deps, state.scenarioDefaults);
  } catch (error) {
    state.scenarioDefaults = previousDefaults;
    if (refs.realSystemMeta) refs.realSystemMeta.textContent = previousMeta;
    throw error;
  }
}

async function applyBinaryLabScenario(deps: ScenarioFlowDeps): Promise<void> {
  const { state, refs } = deps;
  const previousDefaults = state.scenarioDefaults;
  const previousParams = state.params;
  const previousDidactics = state.didacticsRuntime;
  const previousBinaryState = state.binaryLabState;
  const previousDescription = refs.presetDesc.textContent;
  state.scenarioDefaults = cloneParams(buildBinaryLabParams(DEFAULT_BINARY_LAB_CONFIG_V4));
  state.params = ensureDidacticsConfig(cloneParams(state.scenarioDefaults));
  state.didacticsRuntime = initDidacticsRuntime(state.params, deps.getTimeSec());
  state.binaryLabState = createBinaryLabState(DEFAULT_BINARY_LAB_CONFIG_V4.binaryLab);
  if (refs.realSystemSelect) refs.realSystemSelect.value = "";
  if (refs.realSystemMeta) refs.realSystemMeta.textContent = "";
  if (refs.didHypothesisSelect) refs.didHypothesisSelect.value = "";
  refs.presetDesc.textContent = getLabSystemByControlValue(BINARY_MODE_VALUE).description;
  try {
    await applyScenarioParams(deps, state.scenarioDefaults);
  } catch (error) {
    state.scenarioDefaults = previousDefaults;
    state.params = previousParams;
    state.didacticsRuntime = previousDidactics;
    state.binaryLabState = previousBinaryState;
    refs.presetDesc.textContent = previousDescription;
    loadParamsIntoUI(state.params, refs);
    syncBinaryLabUiState(refs, state.binaryLabState);
    throw error;
  }
}

export async function applyScenarioParams(
  deps: ScenarioFlowDeps,
  nextParams: BrowserScenarioDraft,
  options: ApplyScenarioParamsOptions = {},
): Promise<void> {
  const { state, refs } = deps;
  const previous = {
    params: state.params,
    didacticsRuntime: state.didacticsRuntime,
    noise: state.noise,
    comparisonCurveSeries: state.comparisonCurveSeries,
    comparisonInset: state.comparisonInset,
    comparisonGhosts: state.comparisonGhosts,
    comparisonBadges: state.comparisonBadges,
  };
  state.params = ensureDidacticsConfig(cloneParams(nextParams));
  state.comparisonCurveSeries = undefined;
  state.comparisonInset = undefined;
  state.comparisonGhosts = undefined;
  state.comparisonBadges = undefined;
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
  try {
    await deps.rebuildSimulationFromParams();
    deps.resetSimTimeAndLC({ resetNoise: options.resetNoise ?? true });
    syncBinaryLabUiState(refs, state.binaryLabState);
  } catch (error) {
    state.params = previous.params;
    state.didacticsRuntime = previous.didacticsRuntime;
    state.noise = previous.noise;
    state.comparisonCurveSeries = previous.comparisonCurveSeries;
    state.comparisonInset = previous.comparisonInset;
    state.comparisonGhosts = previous.comparisonGhosts;
    state.comparisonBadges = previous.comparisonBadges;
    loadParamsIntoUI(state.params, refs);
    syncAllEnableStates(refs);
    syncQuickControlsFromInputs(refs);
    syncSliderMirrorsFromInputs();
    throw error;
  }
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

function syncBinaryLabSky(refs: UiRefs, status: BinaryLabUiStatus): void {
  if (refs.skyBlackboxHint) refs.skyBlackboxHint.hidden = status.skyVisible;
  refs.skyCanvas.classList.toggle("skyCanvas--hidden", !status.skyVisible);
  const skySummary = document.getElementById("skySummary");
  if (status.active && skySummary) {
    skySummary.textContent = status.skyVisible
      ? "Detached-binary sky-plane geometry revealed; the current component positions are shown above."
      : "Detached-binary sky-plane geometry is hidden until a hypothesis is selected and the learner reveals the sky.";
  }
}
