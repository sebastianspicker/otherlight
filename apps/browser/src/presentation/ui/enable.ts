/** Enables and disables UI control groups while preserving their accessibility state. */
//
// Live enable/disable helpers for UI sections.

import type { UiRefs } from "./refs";
import {
  syncAtmEnabled,
  syncDnEnabled,
  syncExoEnabled,
  syncFSEnabled,
  syncLDInputsEnabled,
  syncMoonInputsEnabled,
  syncMoonShapeEnabled,
  syncPatchInputsEnabled,
  syncPlanetPhaseEnabled,
  syncPlanetShapeEnabled,
  syncSmearEnabled,
  syncSpotEvolutionEnabled,
  syncVarEnabled,
} from "./enableSections";

type ToggleControl = HTMLInputElement | HTMLSelectElement | null;
type WireEnableHandlersOptions = {
  signal?: AbortSignal;
};

export function syncAllEnableStates(r: UiRefs): void {
  syncMoonInputsEnabled(r);
  syncLDInputsEnabled(r);
  syncPatchInputsEnabled(r);
  syncSpotEvolutionEnabled(r);
  syncPlanetPhaseEnabled(r);
  syncPlanetShapeEnabled(r);
  syncMoonShapeEnabled(r);
  syncFSEnabled(r);
  syncAtmEnabled(r);
  syncSmearEnabled(r);
  syncVarEnabled(r);
  syncDnEnabled(r);
  syncExoEnabled(r);
}

function addSyncAllListener(control: ToggleControl, onChange: () => void, signal?: AbortSignal): void {
  const listenerOptions = signal ? { signal } : undefined;
  control?.addEventListener("change", onChange, listenerOptions);
}

export function wireEnableHandlers(r: UiRefs, options: WireEnableHandlersOptions = {}): void {
  const onChange = () => syncAllEnableStates(r);
  const controls: ToggleControl[] = [
    r.moonEnabled,
    r.moonPhaseEnabled,
    r.moonThermalInertiaEnabled,
    r.ldEnabled,
    r.patchesEnabled,
    r.spotEvolutionEnabled,
    r.planetPhaseEnabled,
    r.planetThermalInertiaEnabled,
    r.planetOblateEnabled,
    r.planetRingsEnabled,
    r.fsEnabled,
    r.atmEnabled,
    r.smearEnabled,
    r.varEnabled,
    r.dnEnabled,
    r.exoEnabled,
    r.moonOblateEnabled,
    r.moonRingsEnabled,
  ];
  for (const control of controls) addSyncAllListener(control, onChange, options.signal);

  syncAllEnableStates(r);
}
