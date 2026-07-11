import {
  DEFAULT_PRODUCT_VIEW_STATE,
  parseProductViewState,
  type ProductViewState,
} from "../ui/productViewState";
import { readUiMode } from "../ui/mode";
import { readProductMode } from "../ui/productMode";
import { PRESETS, getPresetById } from "./presets";
import { REAL_SYSTEMS_OPTIONS } from "./realSystems";

type BootstrapProductSetupArgs = {
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
  if (args.realSystemSelect) populateRealSystemSelect(args.realSystemSelect, args.realSystemMeta);
  const parsed =
    typeof window === "undefined"
      ? { state: DEFAULT_PRODUCT_VIEW_STATE, corrections: [] }
      : parseProductViewState(new URLSearchParams(window.location.search));
  const initial = parsed.state;
  args.productModeSelect.value = initial.mode;
  args.uiModeSelect.value = initial.ui === "advanced" ? "expert" : "normal";
  if (args.simModeSelect) args.simModeSelect.value = initial.lab === "binary" ? "binary-lab" : "preset-lab";
  if (args.runtimeModeSelect) {
    args.runtimeModeSelect.value = initial.runtime === "reference" ? "reference" : "realtime";
  }
  applyInitialScenario(args, parsed);
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
  placeholder.textContent = "— choose real system —";
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

function applyInitialScenario(
  args: BootstrapProductSetupArgs,
  parsed: ReturnType<typeof parseProductViewState>,
): void {
  const initial = parsed.state;
  if (initial.source === "real" && args.realSystemSelect) {
    if (hasOption(args.realSystemSelect, initial.scenario)) {
      args.realSystemSelect.value = initial.scenario;
      return;
    }
    parsed.corrections.push(
      `Unknown real-system scenario ${JSON.stringify(initial.scenario)}; using the default preset.`,
    );
    args.presetSelect.value = "default";
    return;
  }
  if (hasOption(args.presetSelect, initial.scenario)) {
    args.presetSelect.value = initial.scenario;
  } else if (initial.scenario !== "default") {
    parsed.corrections.push(
      `Unknown preset scenario ${JSON.stringify(initial.scenario)}; using ${JSON.stringify("default")}.`,
    );
    args.presetSelect.value = "default";
  }
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
    mode: readProductMode(args.productModeSelect.value),
    ui: readUiMode(args.uiModeSelect.value) === "expert" ? "advanced" : "essential",
    source: realScenario ? "real" : "preset",
    scenario: realScenario || args.presetSelect.value || "default",
    lab: args.simModeSelect?.value === "binary-lab" ? "binary" : "preset",
    lesson: args.lessonSelect?.value || args.fallbackLesson,
    runtime: args.runtimeModeSelect?.value === "reference" ? "reference" : "interactive",
  };
}
