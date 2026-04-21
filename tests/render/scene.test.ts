import { describe, expect, it, vi } from "vitest";
import { renderScene } from "../../src/render/scene";
import type { SimulationStepV3 } from "../../src/sim/v3";

function minimalStepV3(): SimulationStepV3 {
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
      occulterGeometry: [],
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
      orbitFrames: {
        planetSky: { x: 0, y: 0, z: 0 },
      },
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

describe("render scene v3 adapter", () => {
  it("routes SimulationStepV3 through drawFrameV3 when available", () => {
    const params = {
      star: { r: 1 },
      planet: { r: 1, orbit: { a: 1, e: 0, inc: 0, Omega: 0, omega: 0, period: 1, t0: 0 } },
    } as any;
    const step = minimalStepV3();

    const drawFrameV3 = vi.fn();
    const drawFrame = vi.fn();
    const fakeRenderer = { drawFrameV3, drawFrame };

    renderScene({
      renderer: fakeRenderer,
      step,
      tSec: 0,
      params,
    });

    expect(drawFrameV3).toHaveBeenCalledTimes(1);
    expect(drawFrame).toHaveBeenCalledTimes(0);
  });

  it("throws when drawFrameV3 is unavailable", () => {
    const step = minimalStepV3();
    const params = {
      star: { r: 1 },
      planet: { r: 1, orbit: { a: 1, e: 0, inc: 0, Omega: 0, omega: 0, period: 1, t0: 0 } },
    } as any;

    const drawFrame = vi.fn();
    const fakeRenderer = { drawFrame } as any;

    expect(() =>
      renderScene({
        renderer: fakeRenderer,
        step,
        tSec: 0,
        params,
      }),
    ).toThrow(/drawFrameV3/i);
    expect(drawFrame).toHaveBeenCalledTimes(0);
  });

  it("throws when drawFrameV3 is not provided", () => {
    const drawFrame = vi.fn();
    const fakeRenderer = { drawFrame } as any;

    expect(() =>
      renderScene({
        renderer: fakeRenderer,
        step: minimalStepV3(),
        tSec: 0,
        params: {
          star: { r: 1 },
          planet: { r: 1, orbit: { a: 1, e: 0, inc: 0, Omega: 0, omega: 0, period: 1, t0: 0 } },
        },
      } as any),
    ).toThrow(/drawFrameV3/i);
  });
});
