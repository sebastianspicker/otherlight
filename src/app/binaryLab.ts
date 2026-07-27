/**
 * Owns binary Lab support within the app layer. Keeps application bootstrap and frame orchestration composable.
 */
import { AU_M, G_SI, SOLAR_MASS_KG, SOLAR_RADIUS_M } from "../core/units";
import type { SystemParams } from "../core/types";
import type { SimulationConfigV4 } from "../sim/v4/types";
import { toSystemParamsV2FromV4 } from "../sim/v4/adapter";

const DAY_SEC = 86_400;
const BINARY_LAB_ECLIPSE_ANCHOR_SEC = 186_278.4;
const BINARY_LAB_ORIGINAL_PERIOD_SEC = 9.6 * DAY_SEC;
const BINARY_PRIMARY_MASS_KG = 1.35 * SOLAR_MASS_KG;
const BINARY_SECONDARY_MASS_KG = 0.95 * SOLAR_MASS_KG;
const BINARY_SEMIMAJOR_AXIS_M = 0.12 * AU_M;
const BINARY_PERIOD_SEC =
  2 *
  Math.PI *
  Math.sqrt(BINARY_SEMIMAJOR_AXIS_M ** 3 / (G_SI * (BINARY_PRIMARY_MASS_KG + BINARY_SECONDARY_MASS_KG)));
const BINARY_ECLIPSE_PHASE = BINARY_LAB_ECLIPSE_ANCHOR_SEC / BINARY_LAB_ORIGINAL_PERIOD_SEC;

export const DEFAULT_BINARY_LAB_CONFIG_V4: SimulationConfigV4 = {
  version: "4",
  mode: "detached-binary-lab",
  observer: { dir: { x: 0, y: 0, z: 1 } },
  binaryLab: {
    enabled: true,
    hideSkyUntilReveal: true,
    requireHypothesis: true,
    lockParamsUntilHypothesis: true,
  },
  bodies: {
    stars: [
      {
        id: "star-a",
        r: 1.15 * SOLAR_RADIUS_M,
        m: BINARY_PRIMARY_MASS_KG,
        luminosityScale: 1,
        teffK: 6_450,
        loggCgs: 4.15,
        metallicityDex: -0.05,
        passband: "g",
      },
      {
        id: "star-b",
        r: 0.82 * SOLAR_RADIUS_M,
        m: BINARY_SECONDARY_MASS_KG,
        luminosityScale: 0.32,
        teffK: 5_450,
        loggCgs: 4.4,
        metallicityDex: -0.1,
        passband: "g",
      },
    ],
    planets: [],
    moons: [],
  },
  orbits: {
    binary: {
      a: BINARY_SEMIMAJOR_AXIS_M,
      e: 0.07,
      inc: (88.8 * Math.PI) / 180,
      Omega: 0,
      omega: 0,
      period: BINARY_PERIOD_SEC,
      // Preserve the curated eclipse phase while deriving the period from
      // a^3 = G (m1 + m2) P^2 / (4 pi^2).
      t0: -BINARY_ECLIPSE_PHASE * BINARY_PERIOD_SEC,
    },
    hierarchy: [],
  },
  photometry: {
    baselineFlux: 1,
    gridRes: 280,
    limbDarkeningModel: {
      default: { kind: "quadratic", u1: 0.44, u2: 0.21 },
      bandpass: "g",
      bands: {
        g: { kind: "quadratic", u1: 0.44, u2: 0.21 },
        r: { kind: "quadratic", u1: 0.34, u2: 0.23 },
      },
    },
  },
  dynamics: {
    relativity: {
      enabled: true,
      ltte: true,
      shapiro: true,
      grPrecession: true,
      c: 299_792_458,
    },
    relativityLevel: "enhanced",
    fidelityProfile: "accurate",
    physicsFeatures: {
      observables: true,
    },
  },
  didactics: {
    enabled: true,
    activeLessonId: "binary-eclipse-lab",
    autoAssess: true,
  },
};

export function buildBinaryLabParams(
  config: SimulationConfigV4 = DEFAULT_BINARY_LAB_CONFIG_V4,
): SystemParams {
  return toSystemParamsV2FromV4(config);
}
