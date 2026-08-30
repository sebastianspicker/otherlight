/** Applies named simulation presets and keeps their UI-facing metadata together. */
//
// Curated, didactic presets for the UI.
//
// Goals:
// - Provide reproducible starting points for exploration / teaching.
// - Keep presets code-defined (type-safe) while still being JSON-serializable via BrowserScenarioDraft.

import type { LimbDarkeningModel, BrowserScenarioDraft } from "../domain/model/types";
import { cloneParams, SCENARIO_DEFAULTS } from "./scenario";
import { MEASUREMENT_EDGE_CASE_PRESETS } from "./presetsEdgeCasesMeasurement";
import { SURFACE_EDGE_CASE_PRESETS } from "./presetsEdgeCasesSurface";

export type ScenarioPreset = {
  id: string;
  label: string;
  description: string;
  params: BrowserScenarioDraft;
};

function base(): BrowserScenarioDraft {
  return cloneParams(SCENARIO_DEFAULTS);
}

function withoutPatches(p: BrowserScenarioDraft): void {
  const ph = p.star.photometry;
  if (!ph) return;
  ph.brightnessPatches = [];
  delete ph.spotEvolution;
}

const EDGE_CASE_PRESETS: ScenarioPreset[] = [...SURFACE_EDGE_CASE_PRESETS, ...MEASUREMENT_EDGE_CASE_PRESETS];

export const PRESETS: ScenarioPreset[] = [
  {
    id: "default",
    label: "Default (didactic transit model)",
    description:
      "Didactically exaggerated planet-moon transit model from the application catalog default, with enlarged bodies and compact orbits for readable canvas geometry and flux changes.",
    params: base(),
  },
  (() => {
    const p = base();
    delete p.moon;

    // Make the light curve visually “clean” for teaching the basic transit geometry.
    withoutPatches(p);
    if (p.dynamics?.exomoonTimingShape) p.dynamics.exomoonTimingShape.enabled = false;

    const ph = p.star.photometry;
    if (ph) {
      // Disable additive terms for a pure transit attenuation demo.
      delete ph.phaseCurve;
      delete ph.moonPhaseCurve;
      delete ph.forwardScattering;
      delete ph.stellarVariability;
      delete ph.dayNightVisibility;
    }

    return {
      id: "kepler-planet-only",
      label: "Kepler: planet-only transit",
      description:
        "Pure planet transit with no moon or additive flux components, ideal for teaching impact parameter and limb darkening.",
      params: p,
    } satisfies ScenarioPreset;
  })(),
  (() => {
    const p = base();
    if (!p.moon) p.moon = base().moon;

    withoutPatches(p);

    // Strengthen limb darkening to make its imprint on ingress/egress obvious.
    const ph = p.star.photometry;
    if (ph) {
      ph.limbDarkeningModel = {
        bandpass: "g",
        default: { kind: "quadratic", u1: 0.55, u2: 0.15 },
        bands: {
          g: { kind: "quadratic", u1: 0.55, u2: 0.15 },
          r: { kind: "quadratic", u1: 0.42, u2: 0.22 },
          i: { kind: "quadratic", u1: 0.35, u2: 0.25 },
        },
      } satisfies LimbDarkeningModel;
    }

    return {
      id: "limb-darkening-variation",
      label: "Limb darkening: multi-band variation",
      description:
        "Stronger quadratic limb darkening with example multi-band coefficients through the bandpass and bands controls.",
      params: p,
    } satisfies ScenarioPreset;
  })(),
  ...EDGE_CASE_PRESETS,
];

export function getPresetById(id: string): ScenarioPreset {
  const preset = PRESETS.find((p) => p.id === id);
  return preset ?? PRESETS[0];
}
