// @vitest-environment jsdom
import { expect, it } from "vitest";
import { Canvas2DRenderer } from "../../src/render/canvas2d";
import { makeMockCanvas } from "../helpers/mockCanvas";

function starTaggedGeometryParams(): any {
  return {
    observer: { dir: { x: 0, y: 0, z: 1 } },
    star: { r: 1 },
    planet: {
      r: 0.5,
      orbit: { a: 2, e: 0, inc: 0, Omega: 0, omega: 0, period: 1, t0: 0 },
    },
  };
}

function starTaggedGeometryStep(): any {
  return {
    tObsSec: 0,
    kinematics: { planetSky: { x: 0.8, y: 0, z: 0.2 } },
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
      occulterGeometry: [{ body: "star", kind: "circle", center: { x: 0.8, y: 0, z: 0.2 }, radius: 0.5 }],
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
        observerDir: { x: 0, y: 0, z: 1 },
        planetSky: { x: 0.8, y: 0, z: 0.2 },
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

it("fits the scene scale for large SI-sized geometry instead of using a fixed scale", () => {
  const canvas = makeMockCanvas(800, 600);
  const renderer = new Canvas2DRenderer(canvas);

  renderer.drawFrameV3(
    {
      observer: { dir: { x: 0, y: 0, z: 1 } },
      star: { r: 6.957e8 },
      planet: {
        r: 6.0e8,
        orbit: { a: 1.4e10, e: 0, inc: 0, Omega: 0, omega: 0, period: 1, t0: 0 },
      },
    } as any,
    {
      tObsSec: 0,
      kinematics: { planetSky: { x: 1.4e10, y: 0, z: 0 } },
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
        occulterGeometry: [
          { body: "planet", kind: "circle", center: { x: 1.4e10, y: 0, z: 0 }, radius: 6.0e8 },
        ],
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
          observerDir: { x: 0, y: 0, z: 1 },
          planetSky: { x: 1.4e10, y: 0, z: 0 },
        },
        uncertaintyFlags: [],
      },
      physicsDiagnostics: {
        ltteConvergence: { enabled: false, status: "disabled" },
        shapiroConvergence: { enabled: false, status: "disabled" },
        integratorStats: { mode: "kepler", nbodyEnabled: false },
        closeEncounterFlags: [],
      },
    },
    0,
  );

  expect(renderer.pixelsPerUnit).toBeGreaterThan(0);
  expect(renderer.pixelsPerUnit).toBeLessThan(1e-6);
});

it("keeps the fitted scene scale stable across frames by default", () => {
  const canvas = makeMockCanvas(800, 600);
  const renderer = new Canvas2DRenderer(canvas);

  const params = {
    observer: { dir: { x: 0, y: 0, z: 1 } },
    star: { r: 6.957e8 },
    planet: {
      r: 6.0e8,
      orbit: { a: 1.4e10, e: 0, inc: 0, Omega: 0, omega: 0, period: 1, t0: 0 },
    },
  } as any;

  const stepAt = (x: number) =>
    ({
      tObsSec: 0,
      kinematics: { planetSky: { x, y: 0, z: 0 } },
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
        occulterGeometry: [{ body: "planet", kind: "circle", center: { x, y: 0, z: 0 }, radius: 6.0e8 }],
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
          observerDir: { x: 0, y: 0, z: 1 },
          planetSky: { x, y: 0, z: 0 },
        },
        uncertaintyFlags: [],
      },
      physicsDiagnostics: {
        ltteConvergence: { enabled: false, status: "disabled" },
        shapiroConvergence: { enabled: false, status: "disabled" },
        integratorStats: { mode: "kepler", nbodyEnabled: false },
        closeEncounterFlags: [],
      },
    }) as any;

  renderer.drawFrameV3(params, stepAt(1.4e10), 0);
  const firstScale = renderer.pixelsPerUnit;
  renderer.drawFrameV3(params, stepAt(2.1e10), 1);

  expect(renderer.pixelsPerUnit).toBe(firstScale);
});

it("re-fits the scene scale per frame only when auto-fit zoom is enabled", () => {
  const canvas = makeMockCanvas(800, 600);
  const renderer = new Canvas2DRenderer(canvas, { autoFitScene: true });

  const params = {
    observer: { dir: { x: 0, y: 0, z: 1 } },
    star: { r: 6.957e8 },
    planet: {
      r: 6.0e8,
      orbit: { a: 1.4e10, e: 0, inc: 0, Omega: 0, omega: 0, period: 1, t0: 0 },
    },
  } as any;

  const stepAt = (x: number) =>
    ({
      tObsSec: 0,
      kinematics: { planetSky: { x, y: 0, z: 0 } },
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
        occulterGeometry: [{ body: "planet", kind: "circle", center: { x, y: 0, z: 0 }, radius: 6.0e8 }],
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
          observerDir: { x: 0, y: 0, z: 1 },
          planetSky: { x, y: 0, z: 0 },
        },
        uncertaintyFlags: [],
      },
      physicsDiagnostics: {
        ltteConvergence: { enabled: false, status: "disabled" },
        shapiroConvergence: { enabled: false, status: "disabled" },
        integratorStats: { mode: "kepler", nbodyEnabled: false },
        closeEncounterFlags: [],
      },
    }) as any;

  renderer.drawFrameV3(params, stepAt(1.4e10), 0);
  const firstScale = renderer.pixelsPerUnit;
  renderer.drawFrameV3(params, stepAt(2.1e10), 1);

  expect(renderer.pixelsPerUnit).toBeLessThan(firstScale);
});

it("applies manual zoom as a multiplier on top of the fitted scene scale", () => {
  const canvas = makeMockCanvas(800, 600);
  const renderer = new Canvas2DRenderer(canvas);

  renderer.drawFrameV3(
    {
      observer: { dir: { x: 0, y: 0, z: 1 } },
      star: { r: 6.957e8 },
      planet: {
        r: 6.0e8,
        orbit: { a: 1.4e10, e: 0, inc: 0, Omega: 0, omega: 0, period: 1, t0: 0 },
      },
    } as any,
    {
      tObsSec: 0,
      kinematics: { planetSky: { x: 1.4e10, y: 0, z: 0 } },
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
        occulterGeometry: [
          { body: "planet", kind: "circle", center: { x: 1.4e10, y: 0, z: 0 }, radius: 6.0e8 },
        ],
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
          observerDir: { x: 0, y: 0, z: 1 },
          planetSky: { x: 1.4e10, y: 0, z: 0 },
        },
        uncertaintyFlags: [],
      },
      physicsDiagnostics: {
        ltteConvergence: { enabled: false, status: "disabled" },
        shapiroConvergence: { enabled: false, status: "disabled" },
        integratorStats: { mode: "kepler", nbodyEnabled: false },
        closeEncounterFlags: [],
      },
    },
    0,
  );

  const fittedScale = renderer.pixelsPerUnit;
  expect(renderer.setZoomMultiplier(4)).toBe(4);
  expect(renderer.pixelsPerUnit).toBeCloseTo(fittedScale * 4, 12);
  renderer.resetZoom();
  expect(renderer.getZoomMultiplier()).toBe(1);
  expect(renderer.pixelsPerUnit).toBeCloseTo(fittedScale, 12);
});

it("renders star-tagged geometry with the richer star-gradient path", () => {
  let radialGradients = 0;
  const canvas = makeMockCanvas(400, 240, {
    createRadialGradient: () => {
      radialGradients += 1;
      return { addColorStop: () => {} };
    },
  });

  const renderer = new Canvas2DRenderer(canvas);
  renderer.drawFrameV3(starTaggedGeometryParams(), starTaggedGeometryStep(), 0);

  expect(radialGradients).toBeGreaterThanOrEqual(3);
});
