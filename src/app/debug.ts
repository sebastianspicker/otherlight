// src/app/debug.ts
//
// Debug overlay DOM bindings.

import type { Canvas2DRenderer, DebugOverlayToggles } from "../render/canvas2d";

function getOptionalCheckbox(id: string): HTMLInputElement | null {
  const el = document.getElementById(id);
  if (!(el instanceof HTMLInputElement)) return null;
  if (el.type !== "checkbox") return null;
  return el;
}

export function wireDebugDOM(renderer: Canvas2DRenderer, signal?: AbortSignal): () => void {
  // These IDs should exist in index.html to control Canvas2DRenderer.debug.
  // If they don't exist, renderer defaults remain in effect.
  const dbgEnabled = getOptionalCheckbox("dbgEnabled");
  const dbgShowObserverDir = getOptionalCheckbox("dbgShowObserverDir");
  const dbgShowOcculters = getOptionalCheckbox("dbgShowOcculters");
  const dbgShowImpactParams = getOptionalCheckbox("dbgShowImpactParams");
  const dbgShowTDV = getOptionalCheckbox("dbgShowTDV");
  const dbgShowFluxDecomposition = getOptionalCheckbox("dbgShowFluxDecomposition");

  function syncRendererDebugFromDOM(): void {
    // Only override values that are present in DOM; otherwise keep current defaults.
    const next: DebugOverlayToggles = { ...renderer.debug };

    if (dbgEnabled) next.enabled = Boolean(dbgEnabled.checked);
    if (dbgShowObserverDir) next.showObserverDir = Boolean(dbgShowObserverDir.checked);
    if (dbgShowOcculters) next.showOcculters = Boolean(dbgShowOcculters.checked);
    if (dbgShowImpactParams) next.showImpactParams = Boolean(dbgShowImpactParams.checked);
    if (dbgShowTDV) next.showTDV = Boolean(dbgShowTDV.checked);
    if (dbgShowFluxDecomposition) next.showFluxDecomposition = Boolean(dbgShowFluxDecomposition.checked);
    if (document.documentElement.dataset.uiMode !== "expert") next.enabled = false;

    renderer.debug = next;
  }

  const all = [
    dbgEnabled,
    dbgShowObserverDir,
    dbgShowOcculters,
    dbgShowImpactParams,
    dbgShowTDV,
    dbgShowFluxDecomposition,
  ];
  const listenerOptions = signal ? { signal } : undefined;
  for (const el of all) {
    if (!el) continue;
    el.addEventListener("change", () => syncRendererDebugFromDOM(), listenerOptions);
  }
  syncRendererDebugFromDOM();

  return syncRendererDebugFromDOM;
}
