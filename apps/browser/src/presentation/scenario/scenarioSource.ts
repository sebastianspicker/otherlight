/** Owns the presentation-only choice of which native scenario selector is visible. */
type ScenarioSource = "preset" | "catalog";

const PRESET_PLACEHOLDER_ATTRIBUTE = "data-scenario-source-placeholder";
const PRESET_VALUE_ATTRIBUTE = "scenarioSourcePresetValue";

function selectedSource(): ScenarioSource {
  const realSystemSelect = document.getElementById("realSystemSelect") as HTMLSelectElement | null;
  return realSystemSelect?.value ? "catalog" : "preset";
}

function setCaption(source: ScenarioSource, committedSource: ScenarioSource): void {
  const caption = document.querySelector<HTMLElement>(`[data-scenario-source-caption="${source}"]`);
  if (!caption) return;
  if (source === committedSource) {
    caption.textContent =
      source === "preset"
        ? "The current model uses a teaching scenario."
        : "The current model uses a catalog system.";
    return;
  }
  caption.textContent =
    source === "preset"
      ? "A catalog system is active. Choosing a teaching scenario will replace the current model."
      : "A teaching scenario is active. Choosing a catalog system will replace the current model.";
}

function showSource(source: ScenarioSource, committedSource: ScenarioSource): void {
  const presetsButton = document.getElementById("scenarioPresetsBtn");
  const catalogButton = document.getElementById("scenarioCatalogBtn");
  const presetsPanel = document.getElementById("scenarioPresetsPanel");
  const catalogPanel = document.getElementById("scenarioCatalogPanel");
  presetsButton?.setAttribute("aria-pressed", source === "preset" ? "true" : "false");
  catalogButton?.setAttribute("aria-pressed", source === "catalog" ? "true" : "false");
  if (presetsPanel) presetsPanel.hidden = source !== "preset";
  if (catalogPanel) catalogPanel.hidden = source !== "catalog";
  setCaption(source, committedSource);
}

function presetPlaceholder(select: HTMLSelectElement): HTMLOptionElement | null {
  return select.querySelector<HTMLOptionElement>(`option[${PRESET_PLACEHOLDER_ATTRIBUTE}]`);
}

function preparePresetBrowse(select: HTMLSelectElement): void {
  if (presetPlaceholder(select)) return;
  select.dataset[PRESET_VALUE_ATTRIBUTE] = select.value;
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Choose a teaching scenario";
  placeholder.disabled = true;
  placeholder.setAttribute(PRESET_PLACEHOLDER_ATTRIBUTE, "");
  select.prepend(placeholder);
  select.value = "";
}

function removePresetPlaceholder(select: HTMLSelectElement): void {
  const placeholder = presetPlaceholder(select);
  if (!placeholder) return;
  const restoreValue = select.value === "" ? select.dataset[PRESET_VALUE_ATTRIBUTE] : undefined;
  placeholder.remove();
  if (restoreValue && Array.from(select.options).some((option) => option.value === restoreValue)) {
    select.value = restoreValue;
  }
  delete select.dataset[PRESET_VALUE_ATTRIBUTE];
}

function browseSource(source: ScenarioSource): void {
  const committedSource = selectedSource();
  const presetSelect = document.getElementById("presetSelect") as HTMLSelectElement | null;
  if (presetSelect) {
    if (source === "preset" && committedSource === "catalog") preparePresetBrowse(presetSelect);
    else removePresetPlaceholder(presetSelect);
  }
  showSource(source, committedSource);
}

/** Resets browsing to the selector associated with the currently committed model. */
export function syncScenarioSource(): void {
  if (typeof document === "undefined") return;
  const presetSelect = document.getElementById("presetSelect") as HTMLSelectElement | null;
  if (presetSelect) removePresetPlaceholder(presetSelect);
  const committedSource = selectedSource();
  showSource(committedSource, committedSource);
}

/** Wires abortable browsing and committed-selection synchronization. */
export function wireScenarioSource(signal: AbortSignal): void {
  if (typeof document === "undefined") return;
  document
    .getElementById("scenarioPresetsBtn")
    ?.addEventListener("click", () => browseSource("preset"), { signal });
  document
    .getElementById("scenarioCatalogBtn")
    ?.addEventListener("click", () => browseSource("catalog"), { signal });
  document.getElementById("presetSelect")?.addEventListener("change", syncScenarioSource, { signal });
  document.getElementById("realSystemSelect")?.addEventListener("change", syncScenarioSource, { signal });
  syncScenarioSource();
}
