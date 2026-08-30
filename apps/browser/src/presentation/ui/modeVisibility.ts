/** Shares mode-token visibility updates between UI mode controls. */
import { setHidden } from "./dom";

export function syncModeVisibility(el: HTMLElement, allowedModes: string, activeMode: string): boolean {
  const modes = allowedModes.split(/\s+/).filter(Boolean);
  const visible = modes.length === 0 || modes.includes(activeMode);
  setHidden(el, !visible);
  if (!visible && el instanceof HTMLDetailsElement) el.open = false;
  return visible;
}
