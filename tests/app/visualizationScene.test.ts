/** Verifies visualization scene contracts across app startup, controls, and runtime integration. */

import { describe, expect, it } from "vitest";

import { buildSceneDidacticOverlay } from "../../src/app/visualizationScene";
import type { SystemParams } from "../../src/core/types";
import type { SimulationStepV3 } from "../../src/sim/v3/types";

const ORBIT = {
  a: 1,
  e: 0,
  inc: 0,
  Omega: 0,
  omega: 0,
  period: 1,
  t0: 0,
};

function makeParams(): SystemParams {
  return {
    star: {
      r: 10,
      photometry: {
        brightnessPatches: [
          { shape: "circle", x: 0.4, y: 0, factor: 0.5, r: 0.2 },
          { shape: "ellipse", x: 2.4, y: 0, factor: 1.2, rx: 1.2, ry: 0.3 },
          { shape: "circle", x: 20, y: 0, factor: 0.5, r: 0.2 },
        ],
      },
    },
    planet: { r: 1, orbit: ORBIT },
  };
}

function makeStep(): SimulationStepV3 {
  return {
    tObsSec: 0,
    kinematics: { planetSky: { x: 0, y: 0, z: 0 } },
    flux: {
      total: 1,
      transitFactor: 1,
      stellarPreTransit: 1,
      stellarVariability: 0,
      planetPhase: 0,
      moonPhase: 0,
      forwardScattering: 0,
      ringScattering: 0,
    },
    renderSignals: {
      occulterGeometry: [{ body: "planet", kind: "circle", center: { x: 0, y: 0, z: 0 }, radius: 1.5 }],
      eventMarkers: [],
      timingMarkers: [],
      visibilityFractions: {},
      fluxComponents: {
        total: 1,
        transitFactor: 1,
        stellarPreTransit: 1,
        stellarVariability: 0,
        planetPhase: 0,
        moonPhase: 0,
        forwardScattering: 0,
        ringScattering: 0,
      },
      orbitFrames: { planetSky: { x: 0, y: 0, z: 0 } },
      uncertaintyFlags: [],
    },
    physicsDiagnostics: {
      ltteConvergence: { enabled: false, status: "disabled" },
      shapiroConvergence: { enabled: false, status: "disabled" },
      integratorStats: { mode: "kepler", nbodyEnabled: false },
      closeEncounterFlags: [],
    },
  };
}

describe("buildSceneDidacticOverlay", () => {
  it("labels occulted spot and facula patches without labeling distant patches", () => {
    const overlay = buildSceneDidacticOverlay({ params: makeParams(), step: makeStep(), tSec: 0 });
    const labels = overlay.badges?.map((badge) => badge.label) ?? [];

    expect(labels.filter((label) => label === "occulted spot")).toHaveLength(1);
    expect(labels.filter((label) => label === "occulted facula")).toHaveLength(1);
  });
});
