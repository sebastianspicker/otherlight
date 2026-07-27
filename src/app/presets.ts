/** Applies named simulation presets and keeps their UI-facing metadata together. */
//
// Curated, didactic presets for the UI.
//
// Goals:
// - Provide reproducible starting points for exploration / teaching.
// - Keep presets code-defined (type-safe) while still being JSON-serializable via SystemParams.

import type { LimbDarkeningModel, SystemDynamicsParams, SystemParams } from "../core/types";
import { cloneParams, SCENARIO_DEFAULTS } from "./scenario";
import { AU_M, EARTH_MASS_KG, G_SI, JUPITER_MASS_KG, SOLAR_MASS_KG } from "../core/units";
import { DYNAMICS_EDGE_CASE_PRESETS } from "./presetsEdgeCasesDynamics";
import { MEASUREMENT_EDGE_CASE_PRESETS } from "./presetsEdgeCasesMeasurement";
import { SURFACE_EDGE_CASE_PRESETS } from "./presetsEdgeCasesSurface";

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
  delete ph.spotEvolution;
}

const EDGE_CASE_PRESETS: ScenarioPreset[] = [
  ...SURFACE_EDGE_CASE_PRESETS,
  ...MEASUREMENT_EDGE_CASE_PRESETS,
  ...DYNAMICS_EDGE_CASE_PRESETS,
];

export const PRESETS: ScenarioPreset[] = [
  {
    id: "default",
    label: "Default (didactic transit model)",
    description:
      "Didactically exaggerated planet-moon transit model from `src/config/scenario.default.json`, with enlarged bodies and compact orbits for readable canvas geometry and flux changes.",
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
  (() => {
    const p = base();
    if (!p.moon) p.moon = base().moon;

    withoutPatches(p);

    const dyn = (p.dynamics ??= {} as SystemDynamicsParams);
    const muStar = G_SI * SOLAR_MASS_KG;
    const muPlanet = G_SI * JUPITER_MASS_KG;
    const muMoon = G_SI * EARTH_MASS_KG;

    const pertA = 0.1 * AU_M;
    const pertPeriod = 2 * Math.PI * Math.sqrt(pertA ** 3 / muStar);

    dyn.nbodyPlanetMoon = {
      enabled: true,
      muStar,
      muPlanet,
      muMoon,
      dtMax: 60,
      softening: 0,
      perturbers: [
        {
          enabled: true,
          mu: G_SI * (0.1 * JUPITER_MASS_KG),
          orbit: {
            a: pertA,
            e: 0.12,
            inc: 0.1,
            Omega: 0,
            omega: 0,
            period: pertPeriod,
            t0: 0,
          },
        },
      ],
    };
    if (dyn.exomoonTimingShape) dyn.exomoonTimingShape.enabled = false;

    return {
      id: "nbody-with-perturber",
      label: "N-body: perturber + star reflex",
      description:
        "Velocity-Verlet N-body scenario with stellar reflex motion and an outer perturber, showing dynamic TTV and TDV effects.",
      params: p,
    } satisfies ScenarioPreset;
  })(),
  ...EDGE_CASE_PRESETS,
];

export function getPresetById(id: string): ScenarioPreset {
  const preset = PRESETS.find((p) => p.id === id);
  return preset ?? PRESETS[0];
}
