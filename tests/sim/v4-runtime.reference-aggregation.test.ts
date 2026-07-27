/** Verifies v4 runtime reference aggregation contracts across system state, transit observables, and V4 integration. */

import { beforeEach, describe, expect, it, vi } from "vitest";

const mockNativeState = vi.hoisted(() => ({
  baselines: [] as Array<{ energy?: number; angularMomentum?: number } | undefined>,
}));

vi.mock("../../src/sim/v4/nativeEngine", () => ({
  stepNativeSimulationV4: ({
    tObsSec,
    conservationBaseline,
  }: {
    tObsSec: number;
    conservationBaseline?: { energy?: number; angularMomentum?: number };
  }) => {
    mockNativeState.baselines.push(conservationBaseline);
    return {
      step: {
        tObsSec,
        kinematics: { planetSky: { x: tObsSec, y: 0, z: 1 } },
        flux: {
          total: tObsSec,
          transitFactor: tObsSec + 10,
          stellarPreTransit: tObsSec + 20,
          stellarVariability: tObsSec + 30,
          planetPhase: tObsSec + 40,
          moonPhase: tObsSec + 50,
          forwardScattering: tObsSec + 60,
          ringScattering: tObsSec + 70,
          refraction: tObsSec + 80,
          decomposition: {
            total: tObsSec,
            transitFactor: tObsSec + 10,
            stellarPreTransit: tObsSec + 20,
            stellarVariability: tObsSec + 30,
            planetPhase: tObsSec + 40,
            moonPhase: tObsSec + 50,
            forwardScattering: tObsSec + 60,
            ringScattering: tObsSec + 70,
            refraction: tObsSec + 80,
          },
        },
        renderSignals: {
          occulterGeometry: [],
          eventMarkers: [],
          timingMarkers: [],
          visibilityFractions: {},
          fluxComponents: {
            total: tObsSec,
            transitFactor: tObsSec + 10,
            stellarPreTransit: tObsSec + 20,
            stellarVariability: tObsSec + 30,
            planetPhase: tObsSec + 40,
            moonPhase: tObsSec + 50,
            forwardScattering: tObsSec + 60,
            ringScattering: tObsSec + 70,
            refraction: tObsSec + 80,
          },
          orbitFrames: { planetSky: { x: tObsSec, y: 0, z: 1 } },
          uncertaintyFlags: [],
        },
        physicsDiagnostics: {
          ltteConvergence: { enabled: false, status: "disabled" },
          shapiroConvergence: { enabled: false, status: "disabled" },
          integratorStats: { mode: "kepler", nbodyEnabled: false },
          closeEncounterFlags: [],
        },
        debug: {
          displayFluxValue: tObsSec,
          baselineFluxUsed: 7,
        },
      },
      conservationBaseline: { energy: tObsSec, angularMomentum: tObsSec + 1 },
    };
  },
}));

describe("v4 reference aggregation", () => {
  beforeEach(() => {
    vi.resetModules();
    mockNativeState.baselines.length = 0;
  });

  it("keeps averaged flux, decomposition, render signals, and debug output internally consistent", async () => {
    const { createSimulationV4 } = await import("../../src/sim/v4/runtime");
    const sim = createSimulationV4({
      version: "4",
      mode: "general-lab",
      runtime: { mode: "reference", referenceSubsteps: 5 },
      observer: { dir: { x: 0, y: 0, z: 1 } },
      bodies: {
        stars: [
          { id: "star-a", r: 1, m: 1, luminosityScale: 1 },
          { id: "star-b", r: 1, m: 1, luminosityScale: 0 },
        ],
        planets: [],
        moons: [],
      },
      orbits: {
        binary: { a: 1, e: 0, inc: 0, Omega: 0, omega: 0, period: 1, t0: 0 },
        hierarchy: [],
      },
      photometry: { baselineFlux: 1 },
    });

    const step = sim.step(10);

    expect(step.flux.total).toBeCloseTo(10, 12);
    expect(step.flux.decomposition?.total).toBeCloseTo(step.flux.total, 12);
    expect(step.flux.decomposition?.transitFactor).toBeCloseTo(step.flux.transitFactor, 12);
    expect(step.renderSignals.fluxComponents.total).toBeCloseTo(step.flux.total, 12);
    expect(step.renderSignals.fluxComponents.refraction).toBeCloseTo(step.flux.refraction ?? 0, 12);
    expect(step.debug?.displayFluxValue).toBeCloseTo(step.flux.total, 12);
  });

  it("uses one stable conservation baseline across reference substeps and updates it once per public step", async () => {
    const { createSimulationV4 } = await import("../../src/sim/v4/runtime");
    const sim = createSimulationV4({
      version: "4",
      mode: "general-lab",
      runtime: { mode: "reference", referenceSubsteps: 5 },
      observer: { dir: { x: 0, y: 0, z: 1 } },
      bodies: {
        stars: [
          { id: "star-a", r: 1, m: 1, luminosityScale: 1 },
          { id: "star-b", r: 1, m: 1, luminosityScale: 0 },
        ],
        planets: [],
        moons: [],
      },
      orbits: {
        binary: { a: 1, e: 0, inc: 0, Omega: 0, omega: 0, period: 1, t0: 0 },
        hierarchy: [],
      },
      photometry: { baselineFlux: 1 },
    });

    sim.step(10);
    expect(mockNativeState.baselines).toEqual([undefined, undefined, undefined, undefined, undefined]);

    mockNativeState.baselines.length = 0;
    sim.step(20);

    expect(mockNativeState.baselines).toEqual([
      { energy: 10, angularMomentum: 11 },
      { energy: 10, angularMomentum: 11 },
      { energy: 10, angularMomentum: 11 },
      { energy: 10, angularMomentum: 11 },
      { energy: 10, angularMomentum: 11 },
    ]);
  });
});
