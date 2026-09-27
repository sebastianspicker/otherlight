/** Shares mode-token visibility updates between UI mode controls. */
import { setHidden } from "./dom";

export type ModeVisibilityAxis = "product-mode" | "product-profile" | "ui-tier";

const visibilityByAxis = new WeakMap<HTMLElement, Map<ModeVisibilityAxis, boolean>>();

export function syncModeVisibility(
  el: HTMLElement,
  allowedModes: string,
  activeMode: string,
  axis: ModeVisibilityAxis = "ui-tier",
): boolean {
  const modes = allowedModes.split(/\s+/).filter(Boolean);
  const axisVisibility = visibilityByAxis.get(el) ?? new Map<ModeVisibilityAxis, boolean>();
  axisVisibility.set(axis, modes.length === 0 || modes.includes(activeMode));
  visibilityByAxis.set(el, axisVisibility);
  const visible = Array.from(axisVisibility.values()).every(Boolean);
  setHidden(el, !visible);
  if (!visible && el instanceof HTMLDetailsElement) el.open = false;
  return visible;
}
