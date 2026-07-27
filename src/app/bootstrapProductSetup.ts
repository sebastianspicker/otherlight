/**
 * Owns bootstrap Product Setup support within the app layer. Keeps application bootstrap and frame orchestration composable.
 */
import {
  DEFAULT_PRODUCT_VIEW_STATE,
  parseProductViewState,
  type ProductViewState,
} from "../ui/productViewState";
import { readUiMode } from "../ui/mode";
import { readProductMode } from "../ui/productMode";
import {
  productLabControlValue,
  productProfileControlValue,
  productRuntimeControlValue,
  productUiControlValue,
  setOptionalSelectValue,
} from "./bootstrapProductControlValues";
import { PRESETS, getPresetById } from "./presets";
import { REAL_SYSTEMS_OPTIONS } from "./realSystems";
import { getLabSystemByControlValue, LAB_SYSTEMS } from "../core/labs";

type BootstrapProductSetupArgs = {
  productProfileSelect: HTMLSelectElement;
  productModeSelect: HTMLSelectElement;
  uiModeSelect: HTMLSelectElement;
  simModeSelect: HTMLSelectElement | null;
  runtimeModeSelect: HTMLSelectElement | null;
  presetSelect: HTMLSelectElement;
  presetDesc: HTMLElement;
  realSystemSelect: HTMLSelectElement | null;
  realSystemMeta: HTMLElement | null;
};

export function initializeProductViewControls(args: BootstrapProductSetupArgs) {
  populatePresetSelect(args.presetSelect, args.presetDesc);
  if (args.simModeSelect) populateLabSystemSelect(args.simModeSelect);
  if (args.realSystemSelect) populateRealSystemSelect(args.realSystemSelect, args.realSystemMeta);
  const parsed =
    typeof window === "undefined"
      ? { state: DEFAULT_PRODUCT_VIEW_STATE, corrections: [] }
      : parseProductViewState(new URLSearchParams(window.location.search));
  applyProductViewControlState(args, parsed);
  return parsed;
}

function populatePresetSelect(presetSelect: HTMLSelectElement, presetDesc: HTMLElement): void {
  presetSelect.replaceChildren();
  for (const preset of PRESETS) {
    const option = document.createElement("option");
    option.value = preset.id;
    option.textContent = preset.label;
    presetSelect.appendChild(option);
  }
  presetSelect.value = "default";
  presetDesc.textContent = getPresetById(presetSelect.value).description;
}

function populateRealSystemSelect(
  realSystemSelect: HTMLSelectElement,
  realSystemMeta: HTMLElement | null,
): void {
  realSystemSelect.replaceChildren();
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Choose a real system";
  realSystemSelect.appendChild(placeholder);
  for (const system of REAL_SYSTEMS_OPTIONS) {
    const option = document.createElement("option");
    option.value = system.id;
    option.textContent = system.label;
    realSystemSelect.appendChild(option);
  }
  realSystemSelect.value = "";
  realSystemSelect.disabled = REAL_SYSTEMS_OPTIONS.length === 0;
  if (realSystemMeta) realSystemMeta.textContent = "";
}

function applyScenarioSelection(
  args: BootstrapProductSetupArgs,
  parsed: ReturnType<typeof parseProductViewState>,
): void {
  const initial = parsed.state;
  if (initial.source === "real" && args.realSystemSelect) {
    if (hasOption(args.realSystemSelect, initial.scenario)) {
      args.realSystemSelect.value = initial.scenario;
      return;
    }
    args.realSystemSelect.value = "";
    parsed.corrections.push(
      `Unknown real-system scenario ${JSON.stringify(initial.scenario)}; using the default preset.`,
    );
    args.presetSelect.value = "default";
    return;
  }
  if (args.realSystemSelect) args.realSystemSelect.value = "";
  if (hasOption(args.presetSelect, initial.scenario)) {
    args.presetSelect.value = initial.scenario;
  } else {
    parsed.corrections.push(
      `Unknown preset scenario ${JSON.stringify(initial.scenario)}; using ${JSON.stringify("default")}.`,
    );
    args.presetSelect.value = "default";
  }
}

export function applyProductLessonSelection(
  select: HTMLSelectElement | null | undefined,
  requestedLesson: string,
  corrections: string[],
): boolean {
  if (!select) return false;
  if (hasOption(select, requestedLesson)) {
    select.value = requestedLesson;
    return true;
  }
  const fallback = select.options[0]?.value;
  if (!fallback) return false;
  corrections.push(`Unknown lesson ${JSON.stringify(requestedLesson)}; using ${JSON.stringify(fallback)}.`);
  select.value = fallback;
  return true;
}

function hasOption(select: HTMLSelectElement, value: string): boolean {
  return Array.from(select.options).some((option) => option.value === value);
}

export function syncProductModeNavigation(
  select: HTMLSelectElement,
  simulationButton: HTMLButtonElement | null,
  labButton: HTMLButtonElement | null,
): void {
  const mode = readProductMode(select.value);
  simulationButton?.setAttribute("aria-current", mode === "simulation" ? "page" : "false");
  labButton?.setAttribute("aria-current", mode === "lab" ? "page" : "false");
}

export function readProductViewStateFromControls(args: {
  productProfileSelect: HTMLSelectElement;
  productModeSelect: HTMLSelectElement;
  uiModeSelect: HTMLSelectElement;
  simModeSelect: HTMLSelectElement | null;
  runtimeModeSelect: HTMLSelectElement | null;
  presetSelect: HTMLSelectElement;
  realSystemSelect: HTMLSelectElement | null;
  lessonSelect: HTMLSelectElement | null;
  fallbackLesson: string;
}): ProductViewState {
  const realScenario = args.realSystemSelect?.value ?? "";
  return {
    profile: args.productProfileSelect.value === "scientific" ? "scientific" : "education",
    mode: readProductMode(args.productModeSelect.value),
    ui: readUiMode(args.uiModeSelect.value) === "expert" ? "advanced" : "essential",
    source: realScenario ? "real" : "preset",
    scenario: realScenario || args.presetSelect.value || "default",
    lab: getLabSystemByControlValue(args.simModeSelect?.value).id,
    lesson: args.lessonSelect?.value || args.fallbackLesson,
    runtime: args.runtimeModeSelect?.value === "reference" ? "reference" : "interactive",
  };
}

export function applyProductViewControlState(
  args: BootstrapProductSetupArgs,
  parsed: ReturnType<typeof parseProductViewState>,
): void {
  const view = parsed.state;
  args.productProfileSelect.value = productProfileControlValue(view);
  args.productModeSelect.value = view.mode;
  args.uiModeSelect.value = productUiControlValue(view);
  setOptionalSelectValue(args.simModeSelect, productLabControlValue(view));
  setOptionalSelectValue(args.runtimeModeSelect, productRuntimeControlValue(view));
  applyScenarioSelection(args, parsed);
}

function populateLabSystemSelect(select: HTMLSelectElement): void {
  select.replaceChildren();
  for (const system of LAB_SYSTEMS) {
    const option = document.createElement("option");
    option.value = system.controlValue;
    option.textContent = system.label;
    select.appendChild(option);
  }
  select.value = LAB_SYSTEMS[0]?.controlValue ?? "";
}
