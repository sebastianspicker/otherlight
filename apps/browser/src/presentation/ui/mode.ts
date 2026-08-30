/**
 * Owns mode support within the ui layer. Keeps DOM-facing behavior separate from application orchestration.
 */
import type { BrowserScenarioDraft } from "../../domain/model/types";
import { syncModeVisibility } from "./modeVisibility";

export type UiMode = "normal" | "expert";

export function canonicalObserverDir(): { x: number; y: number; z: number } {
  return { x: 0, y: 0, z: 1 };
}

export function readUiMode(value: string | null | undefined): UiMode {
  return value === "expert" ? "expert" : "normal";
}

export function getObserverDirForMode(
  params: BrowserScenarioDraft,
  mode: UiMode,
): { x: number; y: number; z: number } {
  if (mode === "normal") return canonicalObserverDir();
  return params.observer?.dir ?? canonicalObserverDir();
}

export function applyObserverModeContract(params: BrowserScenarioDraft, mode: UiMode): void {
  const observer = params.observer ?? { dir: canonicalObserverDir() };
  params.observer = observer;
  observer.dir = getObserverDirForMode(params, mode);
}

export function syncUiModeVisibility(mode: UiMode, root: ParentNode = document): void {
  if (root instanceof Document) root.documentElement.dataset.uiMode = mode;

  const tieredEls = Array.from(root.querySelectorAll<HTMLElement>("[data-ui-tier]"));
  for (const el of tieredEls) {
    const visible = syncModeVisibility(el, el.dataset.uiTier ?? "", mode);
    if (visible && el instanceof HTMLDetailsElement && el.classList.contains("advanced-parameter-drawer")) {
      el.open = true;
    }
  }
}
