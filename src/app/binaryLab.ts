import { AU_M, SOLAR_MASS_KG, SOLAR_RADIUS_M } from "../core/units";
import type { SystemParams } from "../core/types";
import type { SimulationConfigV4 } from "../sim/v4/types";
import { toSystemParamsV2FromV4 } from "../sim/v4/adapter";

const DAY_SEC = 86_400;

export const DEFAULT_BINARY_LAB_CONFIG_V4: SimulationConfigV4 = {
  version: "4",
  mode: "detached-binary-lab",
  observer: { dir: { x: 1 / Math.SQRT2, y: 0, z: 1 / Math.SQRT2 } },
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
        m: 1.35 * SOLAR_MASS_KG,
        luminosityScale: 1,
      },
      {
        id: "star-b",
        r: 0.82 * SOLAR_RADIUS_M,
        m: 0.95 * SOLAR_MASS_KG,
        luminosityScale: 0.32,
      },
    ],
    planets: [],
    moons: [],
  },
  orbits: {
    binary: {
      a: 0.12 * AU_M,
      e: 0.07,
      inc: (88.8 * Math.PI) / 180,
      Omega: 0,
      omega: 0,
      period: 9.6 * DAY_SEC,
      t0: 0,
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
    activeLessonId: "kepler-geometry",
    autoAssess: true,
  },
};

export function buildBinaryLabParams(
  config: SimulationConfigV4 = DEFAULT_BINARY_LAB_CONFIG_V4,
): SystemParams {
  return toSystemParamsV2FromV4(config);
}
