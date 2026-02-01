// src/app/presets.ts
//
// Curated, didactic presets for the UI.
//
// Goals:
// - Provide reproducible starting points for exploration / teaching.
// - Keep presets code-defined (type-safe) while still being JSON-serializable via SystemParams.

import type { SystemParams } from "../core/types";
import { cloneParams, SCENARIO_DEFAULTS } from "./scenario";

export type ScenarioPreset = {
  id: string;
  label: string;
  description: string;
  params: SystemParams;
};

function base(): SystemParams {
  return cloneParams(SCENARIO_DEFAULTS);
}

function withoutPatches(p: SystemParams): void {
  const ph = p.star.photometry;
  if (!ph) return;
  ph.brightnessPatches = [];
  delete (ph as any).spotEvolution;
}

export const PRESETS: ScenarioPreset[] = [
  {
    id: "default",
    label: "Default (scientific baseline)",
    description:
      "Baseline-Szenario aus `src/config/scenario.default.json` (Planet+Mond, LD, optionale Diagnose-Hooks).",
    params: base(),
  },
  (() => {
    const p = base();
    delete p.moon;

    // Make the light curve visually “clean” for teaching the basic transit geometry.
    withoutPatches(p);
    delete p.dynamics?.nbodyPlanetMoon;
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
        "Reiner Planetentransit (kein Mond), keine additiven Flux-Komponenten: ideal, um Impact-Parameter/LD zu erklären.",
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
      } as any;
    }

    return {
      id: "limb-darkening-variation",
      label: "Limb darkening: multi-band variation",
      description:
        "Stärkeres quadratisches Limb Darkening + Beispiel für Multi-band-Koeffizienten (bandpass/bands).",
      params: p,
    } satisfies ScenarioPreset;
  })(),
  (() => {
    const p = base();
    if (!p.moon) p.moon = base().moon;

    withoutPatches(p);

    const dyn = (p.dynamics ??= {} as any);
    dyn.nbodyPlanetMoon = {
      enabled: true,
      // Keep mus in the same “order of magnitude” as the default scenario; stable & interactive.
      muStar: 1.5,
      muPlanet: 0.27,
      muMoon: 0.01,
      dtMax: 5,
      softening: 0,
      perturbers: [
        {
          enabled: true,
          mu: 0.05,
          orbit: { a: 520, e: 0.12, inc: 0.1, Omega: 0, omega: 0, period: 90_000, t0: 0 },
        },
      ],
    };
    if (dyn.exomoonTimingShape) dyn.exomoonTimingShape.enabled = false;

    return {
      id: "nbody-with-perturber",
      label: "N-body: perturber + star reflex",
      description:
        "N-body (Velocity-Verlet) mit star reflex motion und einem äußeren Perturber: zeigt dynamische TTV/TDV-Effekte.",
      params: p,
    } satisfies ScenarioPreset;
  })(),
];

export function getPresetById(id: string): ScenarioPreset {
  const preset = PRESETS.find((p) => p.id === id);
  return preset ?? PRESETS[0];
}
