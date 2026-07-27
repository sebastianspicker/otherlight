// @vitest-environment jsdom
/** Verifies canvas2d renderer core rendering behavior and visual interpretation. */

import { expect, it, vi } from "vitest";
import { Canvas2DRenderer } from "../../src/render/canvas2d";
import { makeMockCanvas } from "../helpers/mockCanvas";

type SkyPointFixture = { x: number; y: number; z: number };

function minimalFrameParams(starPhotometry?: unknown): any {
  return {
    observer: { dir: { x: 0, y: 0, z: 1 } },
    star: { r: 1, photometry: starPhotometry },
    planet: {
      r: 0.25,
      orbit: { a: 2, e: 0, inc: 0, Omega: 0, omega: 0, period: 1, t0: 0 },
    },
  };
}

function minimalFrameStep(
  planetSky: SkyPointFixture = { x: 0, y: 0, z: 0 },
  occulterGeometry: unknown[] = [],
): any {
  return {
    tObsSec: 0,
    kinematics: { planetSky },
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
      occulterGeometry,
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
        planetSky,
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

function circleOcculter(z: number, radius = 0.25): any {
  return { body: "planet", kind: "circle", center: { x: 0.8, y: 0, z }, radius };
}

it("is exported as a constructor function", () => {
  expect(typeof Canvas2DRenderer).toBe("function");
});

it("constructs without throwing when given a canvas with a mock 2d context", () => {
  const canvas = makeMockCanvas();
  expect(() => new Canvas2DRenderer(canvas)).not.toThrow();
});

it("throws when the canvas returns null from getContext", () => {
  const canvas = makeMockCanvas();
  (canvas as any).getContext = () => null;
  expect(() => new Canvas2DRenderer(canvas)).toThrow("2D context unavailable");
});

it("adds a visible atmosphere halo draw pass for atmospheric transmission targets", () => {
  const gradientCalls: Array<"radial" | "linear"> = [];
  const canvas = makeMockCanvas(200, 100, {
    createLinearGradient: () => {
      gradientCalls.push("linear");
      return { addColorStop: () => {} };
    },
    createRadialGradient: () => {
      gradientCalls.push("radial");
      return { addColorStop: () => {} };
    },
  });

  const renderer = new Canvas2DRenderer(canvas, { showOrbits: false });
  renderer.debug = { enabled: false } as any;

  const step = minimalFrameStep({ x: 0.8, y: 0, z: 0.2 }, [circleOcculter(0.2)]);
  const baseParams = minimalFrameParams();

  renderer.drawFrameV3(baseParams, step, 0);
  const baselineRadialGradients = gradientCalls.filter((kind) => kind === "radial").length;

  gradientCalls.length = 0;
  const withAtmosphere = minimalFrameParams({
    atmosphereTransmission: {
      enabled: true,
      target: "planet",
      kind: "exponential-halo",
      r0: 0.25,
      H: 0.05,
      tau0: 0.8,
    },
  });
  renderer.drawFrameV3(withAtmosphere, step, 0);
  const atmosphereRadialGradients = gradientCalls.filter((kind) => kind === "radial").length;

  expect(atmosphereRadialGradients).toBe(baselineRadialGradients + 1);
});

it("reuses projected orbit screen coordinates until the viewport transform changes", () => {
  const renderer = new Canvas2DRenderer(makeMockCanvas(200, 100));
  const pts = [
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 1, y: 0 },
  ];

  const coords1 = (renderer as any).getProjectedOrbitPath(pts).coords;
  const coords2 = (renderer as any).getProjectedOrbitPath(pts).coords;
  expect(coords2).toBe(coords1);

  renderer.setZoomMultiplier(2);
  const coords3 = (renderer as any).getProjectedOrbitPath(pts).coords;
  expect(coords3).not.toBe(coords1);
});

it("reuses a cached Path2D for steady orbit draws when the browser supports it", () => {
  const Path2DOriginal = (globalThis as any).Path2D;
  const stroke = vi.fn();

  class FakePath2D {
    moveTo = vi.fn();
    lineTo = vi.fn();
  }

  (globalThis as any).Path2D = FakePath2D;

  try {
    const canvas = makeMockCanvas(200, 100, {
      stroke,
    });

    const renderer = new Canvas2DRenderer(canvas, { showOrbits: true, showAxes: false });
    renderer.debug = { enabled: false } as any;
    const pts = [
      { x: -1, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 0 },
    ];
    (renderer as any).orbitCache.getPlanetPath = () => pts;
    (renderer as any).drawStar = () => {};
    (renderer as any).drawOcculterGeometry = () => {};
    (renderer as any).drawEventMarkers = () => {};
    (renderer as any).toOverlayData = () => ({});

    const params = minimalFrameParams();
    const step = minimalFrameStep();

    renderer.drawFrameV3(params, step, 0);
    const firstPath = stroke.mock.calls.find((call) => call.length === 1)?.[0];

    stroke.mockClear();
    renderer.drawFrameV3(params, step, 0);
    const secondPath = stroke.mock.calls.find((call) => call.length === 1)?.[0];

    expect(firstPath).toBeInstanceOf(FakePath2D);
    expect(secondPath).toBe(firstPath);
  } finally {
    (globalThis as any).Path2D = Path2DOriginal;
  }
});

it("preserves painter order for the common two-drawable path without a full sort", () => {
  const canvas = makeMockCanvas();
  const renderer = new Canvas2DRenderer(canvas, { showOrbits: false });
  const calls: string[] = [];

  (renderer as any).drawStar = () => {
    calls.push("star");
  };
  (renderer as any).drawOcculterGeometry = () => {
    calls.push("occulter");
  };
  (renderer as any).drawAxes = () => {};
  (renderer as any).drawEventMarkers = () => {};
  (renderer as any).toOverlayData = () => ({});

  const params = {
    observer: { dir: { x: 0, y: 0, z: 1 } },
    star: { r: 1 },
    planet: {
      r: 0.5,
      orbit: { a: 2, e: 0, inc: 0, Omega: 0, omega: 0, period: 1, t0: 0 },
    },
  } as any;

  const stepWithZ = (z: number) =>
    ({
      tObsSec: 0,
      kinematics: { planetSky: { x: 0.8, y: 0, z } },
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
        occulterGeometry: [{ body: "planet", kind: "circle", center: { x: 0.8, y: 0, z }, radius: 0.5 }],
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
          planetSky: { x: 0.8, y: 0, z },
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

  renderer.drawFrameV3(params, stepWithZ(-0.2), 0);
  expect(calls).toEqual(["occulter", "star"]);

  calls.length = 0;

  renderer.drawFrameV3(params, stepWithZ(0.2), 0);
  expect(calls).toEqual(["star", "occulter"]);
});

it("renders didactic scene overlays, timing badges, and ghosts without throwing", () => {
  const fillTextCalls: string[] = [];
  const canvas = makeMockCanvas(240, 160);
  (canvas as any).getContext = () => ({
    clearRect: () => {},
    fillRect: () => {},
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    quadraticCurveTo: () => {},
    stroke: () => {},
    fill: () => {},
    arc: () => {},
    ellipse: () => {},
    rect: () => {},
    clip: () => {},
    save: () => {},
    restore: () => {},
    scale: () => {},
    translate: () => {},
    rotate: () => {},
    setTransform: () => {},
    setLineDash: () => {},
    fillText: (text: string) => {
      fillTextCalls.push(text);
    },
    strokeText: () => {},
    measureText: (text: string) => ({ width: text.length * 6 }),
    createLinearGradient: () => ({ addColorStop: () => {} }),
    createRadialGradient: () => ({ addColorStop: () => {} }),
    createPattern: () => null,
    drawImage: () => {},
    getImageData: () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 }),
    putImageData: () => {},
    canvas,
    lineWidth: 1,
    strokeStyle: "#000",
    fillStyle: "#000",
    globalAlpha: 1,
    font: "10px sans-serif",
    lineJoin: "miter" as CanvasLineJoin,
    textAlign: "start" as CanvasTextAlign,
    textBaseline: "alphabetic" as CanvasTextBaseline,
  });

  const renderer = new Canvas2DRenderer(canvas, { showOrbits: false });
  renderer.setDidacticOverlay({
    lines: [{ x1: -0.6, y1: 0.1, x2: 0.6, y2: 0.1, color: "#8ecae6", label: "planet chord", dashed: true }],
    points: [{ x: 0, y: 0, color: "#ffd166", label: "barycenter" }],
    badges: [{ label: "moon leads by 20 s", color: "#ffd166" }],
    ghosts: [
      {
        label: "next epoch",
        color: "rgba(255,255,255,0.26)",
        geometry: [{ body: "planet", kind: "circle", center: { x: 0.2, y: 0, z: 0.2 }, radius: 0.2 }],
      },
    ],
  });

  const step = {
    tObsSec: 0,
    kinematics: { planetSky: { x: 0, y: 0, z: 0.2 } },
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
      occulterGeometry: [{ body: "planet", kind: "circle", center: { x: 0, y: 0, z: 0.2 }, radius: 0.2 }],
      eventMarkers: [{ id: "mid", kind: "transit", label: "planet mid", active: true }],
      timingMarkers: [{ id: "planetIngressSec", seconds: -120 }],
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
        planetSky: { x: 0, y: 0, z: 0.2 },
      },
      uncertaintyFlags: [],
    },
    physicsDiagnostics: {
      ltteConvergence: { enabled: false, status: "disabled" },
      shapiroConvergence: { enabled: false, status: "disabled" },
      integratorStats: { mode: "kepler", nbodyEnabled: false },
      closeEncounterFlags: [],
    },
  } as any;

  const params = {
    observer: { dir: { x: 0, y: 0, z: 1 } },
    star: { r: 1, photometry: undefined },
    planet: {
      r: 0.2,
      orbit: { a: 2, e: 0, inc: 0, Omega: 0, omega: 0, period: 1, t0: 0 },
    },
  } as any;

  expect(() => renderer.drawFrameV3(params, step, 0)).not.toThrow();
  expect(fillTextCalls).toContain("planet chord");
  expect(fillTextCalls).toContain("barycenter");
  expect(fillTextCalls).toContain("moon leads by 20 s");
  expect(fillTextCalls).toContain("next epoch");
  expect(fillTextCalls).toContain("planetIngressSec: -120 s");
});
