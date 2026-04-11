// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { Canvas2DRenderer, LightCurvePlot } from "../../src/render/canvas2d";

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/**
 * Create a canvas element with a stubbed getContext("2d") that returns
 * a minimal mock context. jsdom does not implement the Canvas 2D API,
 * so we provide just enough for the constructors to succeed.
 */
function makeMockCanvas(w = 200, h = 100): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;

  // Stub getBoundingClientRect so ensureHiDPICanvas sees non-zero CSS size.
  canvas.getBoundingClientRect = () => ({
    x: 0,
    y: 0,
    width: w,
    height: h,
    top: 0,
    right: w,
    bottom: h,
    left: 0,
    toJSON() {},
  });

  // Stub getContext to return a fake CanvasRenderingContext2D.
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
    fillText: () => {},
    strokeText: () => {},
    measureText: () => ({ width: 10 }),
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

  return canvas;
}

// ---------------------------------------------------------------------------
// Canvas2DRenderer
// ---------------------------------------------------------------------------

describe("Canvas2DRenderer", () => {
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
      const canvas = makeMockCanvas(200, 100);
      (canvas as any).getContext = () => ({
        clearRect: () => {},
        fillRect: () => {},
        beginPath: () => {},
        moveTo: () => {},
        lineTo: () => {},
        quadraticCurveTo: () => {},
        stroke,
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
        fillText: () => {},
        strokeText: () => {},
        measureText: () => ({ width: 10 }),
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

      const params = {
        observer: { dir: { x: 0, y: 0, z: 1 } },
        star: { r: 1 },
        planet: {
          r: 0.5,
          orbit: { a: 2, e: 0, inc: 0, Omega: 0, omega: 0, period: 1, t0: 0 },
        },
      } as any;
      const step = {
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
            observerDir: { x: 0, y: 0, z: 1 },
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
      } as any;

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
    const canvas = document.createElement("canvas");
    canvas.width = 400;
    canvas.height = 240;
    canvas.getBoundingClientRect = () => ({
      x: 0,
      y: 0,
      width: 400,
      height: 240,
      top: 0,
      right: 400,
      bottom: 240,
      left: 0,
      toJSON() {},
    });

    let radialGradients = 0;
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
      fillText: () => {},
      strokeText: () => {},
      measureText: () => ({ width: 10 }),
      createLinearGradient: () => ({ addColorStop: () => {} }),
      createRadialGradient: () => {
        radialGradients += 1;
        return { addColorStop: () => {} };
      },
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

    const renderer = new Canvas2DRenderer(canvas);
    renderer.drawFrameV3(
      {
        observer: { dir: { x: 0, y: 0, z: 1 } },
        star: { r: 1 },
        planet: {
          r: 0.5,
          orbit: { a: 2, e: 0, inc: 0, Omega: 0, omega: 0, period: 1, t0: 0 },
        },
      } as any,
      {
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
      } as any,
      0,
    );

    expect(radialGradients).toBeGreaterThanOrEqual(3);
  });
});

// ---------------------------------------------------------------------------
// LightCurvePlot
// ---------------------------------------------------------------------------

describe("LightCurvePlot", () => {
  it("is exported as a constructor function", () => {
    expect(typeof LightCurvePlot).toBe("function");
  });

  it("constructs without throwing when given a canvas element", () => {
    const canvas = makeMockCanvas();
    expect(() => new LightCurvePlot(canvas)).not.toThrow();
  });

  it("push() accepts numeric values without throwing", () => {
    const canvas = makeMockCanvas();
    const plot = new LightCurvePlot(canvas);
    expect(() => {
      plot.push(1.0);
      plot.push(0.998);
      plot.push(0.995);
    }).not.toThrow();
  });

  it("clear() resets internal state so subsequent draw has no data", () => {
    const canvas = makeMockCanvas();
    const plot = new LightCurvePlot(canvas);

    // Push some samples
    plot.push(1.0);
    plot.push(0.99);
    plot.push(0.98);

    // After clear, the plot should have no samples.
    plot.clear();

    // draw() should not throw even with zero samples after clear.
    expect(() => plot.draw()).not.toThrow();
  });

  it("push() ignores non-finite values", () => {
    const canvas = makeMockCanvas();
    const plot = new LightCurvePlot(canvas);

    // These should be silently ignored (no throw).
    plot.push(NaN);
    plot.push(Infinity);
    plot.push(-Infinity);

    // Only finite values should have been retained. After pushing
    // only non-finite values, clear + draw should still be safe.
    plot.clear();
    expect(() => plot.draw()).not.toThrow();
  });

  it("draw() does not throw with enough samples for a line", () => {
    const canvas = makeMockCanvas(300, 150);
    const plot = new LightCurvePlot(canvas);

    for (let i = 0; i < 50; i++) {
      plot.push(1.0 - i * 0.001);
    }

    expect(() => plot.draw()).not.toThrow();
  });

  it("draw() renders a single-sample marker instead of waiting text", () => {
    const canvas = makeMockCanvas(300, 150);
    const fillTextCalls: string[] = [];
    const arcCalls: Array<{ x: number; y: number; r: number }> = [];
    (canvas as any).getContext = () => ({
      clearRect: () => {},
      fillRect: () => {},
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      quadraticCurveTo: () => {},
      stroke: () => {},
      fill: () => {},
      arc: (x: number, y: number, r: number) => {
        arcCalls.push({ x, y, r });
      },
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
      measureText: () => ({ width: 10 }),
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

    const plot = new LightCurvePlot(canvas);
    plot.push(1);
    plot.draw();

    expect(fillTextCalls).not.toContain("Awaiting data...");
    expect(arcCalls).toHaveLength(1);
  });

  it("draw() renders a flat multi-sample series instead of disappearing on zero-span flux", () => {
    const canvas = makeMockCanvas(300, 150);
    const fillTextCalls: string[] = [];
    let strokeCalls = 0;
    (canvas as any).getContext = () => ({
      clearRect: () => {},
      fillRect: () => {},
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      quadraticCurveTo: () => {},
      stroke: () => {
        strokeCalls += 1;
      },
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
      measureText: () => ({ width: 10 }),
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

    const plot = new LightCurvePlot(canvas, 50, { xMode: "time", trackingMode: "dynamic" });
    for (let i = 0; i < 20; i++) {
      plot.push(1, 1_000 + i);
    }
    plot.draw();

    expect(fillTextCalls).not.toContain("Awaiting data...");
    expect(strokeCalls).toBeGreaterThan(0);
  });

  it("shows full history for fixed and dynamic, and uses a trailing window only in live mode", () => {
    const canvas = makeMockCanvas(300, 150);
    const fixedPlot = new LightCurvePlot(canvas, 20, {
      xMode: "time",
      trackingMode: "fixed",
      dynamicWindowSec: 12,
    });
    const dynamicPlot = new LightCurvePlot(canvas, 20, {
      xMode: "time",
      trackingMode: "dynamic",
    });
    const livePlot = new LightCurvePlot(canvas, 20, {
      xMode: "time",
      trackingMode: "live",
      dynamicWindowSec: 2,
    });

    for (let i = 0; i < 5; i++) {
      const t = -2 + i;
      fixedPlot.push(1 - i * 0.001, t);
      dynamicPlot.push(1 - i * 0.001, i);
      livePlot.push(1 - i * 0.001, 10 + i);
    }

    expect((fixedPlot as any).getVisibleSampleBounds()).toEqual({ start: 0, end: 5 });
    expect((fixedPlot as any).getVisibleTimeDomain(0, 5)).toEqual({ tMin: -2, tMax: 2 });
    expect((dynamicPlot as any).getVisibleSampleBounds()).toEqual({ start: 0, end: 5 });
    expect((dynamicPlot as any).getVisibleTimeDomain(0, 5)).toEqual({ tMin: 0, tMax: 4 });
    expect((livePlot as any).getVisibleSampleBounds()).toEqual({ start: 2, end: 5 });
    expect((livePlot as any).getVisibleTimeDomain(2, 5)).toEqual({ tMin: 12, tMax: 14 });
  });

  it("retains only the newest capacity window without unbounded history growth", () => {
    const canvas = makeMockCanvas(300, 150);
    const plot = new LightCurvePlot(canvas, 10, {
      xMode: "time",
      trackingMode: "dynamic",
    });

    for (let i = 0; i < 1500; i++) {
      plot.push(1 - i * 1e-4, i);
    }

    expect((plot as any).getVisibleSampleBounds()).toEqual({ start: 0, end: 10 });
    expect((plot as any).getVisibleTimeDomain(0, 10)).toEqual({ tMin: 1490, tMax: 1499 });
    expect((plot as any).flux.length).toBeLessThanOrEqual(20);
    expect((plot as any).t.length).toBeLessThanOrEqual(20);
  });

  it("draw() stays safe and uses the retained newest window after over-capacity pushes", () => {
    const canvas = makeMockCanvas(300, 150);
    const moveToCalls: Array<{ x: number; y: number }> = [];
    (canvas as any).getContext = () => ({
      clearRect: () => {},
      fillRect: () => {},
      beginPath: () => {},
      moveTo: (x: number, y: number) => {
        moveToCalls.push({ x, y });
      },
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
      fillText: () => {},
      strokeText: () => {},
      measureText: () => ({ width: 10 }),
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

    const plot = new LightCurvePlot(canvas, 12, {
      xMode: "time",
      trackingMode: "dynamic",
    });
    for (let i = 0; i < 400; i++) {
      plot.push(1 - i * 1e-4, i);
    }

    expect(() => plot.draw()).not.toThrow();
    expect(moveToCalls.length).toBeGreaterThan(0);
    expect((plot as any).getVisibleTimeDomain(0, 12)).toEqual({ tMin: 388, tMax: 399 });
  });

  it("draw() keeps the plotted curve readable under robust scaling with a large outlier", () => {
    const canvas = makeMockCanvas(300, 150);
    const curveY: number[] = [];
    let currentStrokeStyle = "#000";
    (canvas as any).getContext = () => ({
      clearRect: () => {},
      fillRect: () => {},
      beginPath: () => {},
      moveTo: (_x: number, y: number) => {
        if (currentStrokeStyle === "#4cc9f0") curveY.push(y);
      },
      lineTo: (_x: number, y: number) => {
        if (currentStrokeStyle === "#4cc9f0") curveY.push(y);
      },
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
      fillText: () => {},
      strokeText: () => {},
      measureText: () => ({ width: 10 }),
      createLinearGradient: () => ({ addColorStop: () => {} }),
      createRadialGradient: () => ({ addColorStop: () => {} }),
      createPattern: () => null,
      drawImage: () => {},
      getImageData: () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 }),
      putImageData: () => {},
      canvas,
      lineWidth: 1,
      get strokeStyle() {
        return currentStrokeStyle;
      },
      set strokeStyle(value: string | CanvasGradient | CanvasPattern) {
        currentStrokeStyle = typeof value === "string" ? value : currentStrokeStyle;
      },
      fillStyle: "#000",
      globalAlpha: 1,
      font: "10px sans-serif",
      lineJoin: "miter" as CanvasLineJoin,
      textAlign: "start" as CanvasTextAlign,
      textBaseline: "alphabetic" as CanvasTextBaseline,
    });

    const plot = new LightCurvePlot(canvas, 80, {
      xMode: "time",
      trackingMode: "dynamic",
      yScaleMode: "robust",
      yQuantiles: { lo: 0.05, hi: 0.95 },
    });
    for (let i = 0; i < 40; i++) {
      plot.push(1 - i * 0.001, i);
    }
    plot.push(10, 40);

    expect(() => plot.draw()).not.toThrow();
    expect(curveY.length).toBeGreaterThan(10);
    expect(Math.max(...curveY) - Math.min(...curveY)).toBeGreaterThan(20);
  });

  it("draw() still renders the mean line from the retained visible window when enabled", () => {
    const canvas = makeMockCanvas(300, 150);
    let currentStrokeStyle = "#000";
    let meanLineSegments = 0;
    (canvas as any).getContext = () => ({
      clearRect: () => {},
      fillRect: () => {},
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {
        if (currentStrokeStyle === "rgba(76, 201, 240, 0.4)") meanLineSegments += 1;
      },
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
      fillText: () => {},
      strokeText: () => {},
      measureText: () => ({ width: 10 }),
      createLinearGradient: () => ({ addColorStop: () => {} }),
      createRadialGradient: () => ({ addColorStop: () => {} }),
      createPattern: () => null,
      drawImage: () => {},
      getImageData: () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 }),
      putImageData: () => {},
      canvas,
      lineWidth: 1,
      get strokeStyle() {
        return currentStrokeStyle;
      },
      set strokeStyle(value: string | CanvasGradient | CanvasPattern) {
        currentStrokeStyle = typeof value === "string" ? value : currentStrokeStyle;
      },
      fillStyle: "#000",
      globalAlpha: 1,
      font: "10px sans-serif",
      lineJoin: "miter" as CanvasLineJoin,
      textAlign: "start" as CanvasTextAlign,
      textBaseline: "alphabetic" as CanvasTextBaseline,
    });

    const plot = new LightCurvePlot(canvas, 12, {
      xMode: "time",
      trackingMode: "dynamic",
      showMeanLine: true,
    });
    for (let i = 0; i < 40; i++) {
      plot.push(1 - i * 0.001, i);
    }

    expect(() => plot.draw()).not.toThrow();
    expect(meanLineSegments).toBeGreaterThan(0);
    expect((plot as any).getVisibleTimeDomain(0, 12)).toEqual({ tMin: 28, tMax: 39 });
  });

  it("draw() still renders in time mode when some visible samples have no finite time", () => {
    const canvas = makeMockCanvas(300, 150);
    const lineToCalls: Array<{ x: number; y: number }> = [];
    (canvas as any).getContext = () => ({
      clearRect: () => {},
      fillRect: () => {},
      beginPath: () => {},
      moveTo: () => {},
      lineTo: (x: number, y: number) => {
        lineToCalls.push({ x, y });
      },
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
      fillText: () => {},
      strokeText: () => {},
      measureText: () => ({ width: 10 }),
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

    const plot = new LightCurvePlot(canvas, 12, {
      xMode: "time",
      trackingMode: "dynamic",
    });
    plot.push(1, 0);
    plot.push(0.999, 1);
    plot.push(0.998);
    plot.push(0.997, 3);

    expect(() => plot.draw()).not.toThrow();
    expect(lineToCalls.length).toBeGreaterThan(0);
    expect((plot as any).getVisibleTimeDomain(0, 4)).toEqual({ tMin: 0, tMax: 3 });
  });

  it("draw() still renders time-axis labels in time mode", () => {
    const canvas = makeMockCanvas(300, 150);
    const fillTextCalls: string[] = [];
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
      measureText: () => ({ width: 10 }),
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

    const plot = new LightCurvePlot(canvas, 12, {
      xMode: "time",
      trackingMode: "dynamic",
    });
    for (let i = 0; i < 8; i++) {
      plot.push(1 - i * 0.001, i);
    }

    expect(() => plot.draw()).not.toThrow();
    expect(fillTextCalls).toContain("t [s]");
    expect(fillTextCalls.length).toBeGreaterThan(4);
  });

  it("draw() uses non-uniform time spacing for all-finite time windows", () => {
    const canvas = makeMockCanvas(300, 150);
    const curveX: number[] = [];
    let currentStrokeStyle = "#000";
    (canvas as any).getContext = () => ({
      clearRect: () => {},
      fillRect: () => {},
      beginPath: () => {},
      moveTo: (x: number) => {
        if (currentStrokeStyle === "#4cc9f0") curveX.push(x);
      },
      lineTo: (x: number) => {
        if (currentStrokeStyle === "#4cc9f0") curveX.push(x);
      },
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
      fillText: () => {},
      strokeText: () => {},
      measureText: () => ({ width: 10 }),
      createLinearGradient: () => ({ addColorStop: () => {} }),
      createRadialGradient: () => ({ addColorStop: () => {} }),
      createPattern: () => null,
      drawImage: () => {},
      getImageData: () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 }),
      putImageData: () => {},
      canvas,
      lineWidth: 1,
      get strokeStyle() {
        return currentStrokeStyle;
      },
      set strokeStyle(value: string | CanvasGradient | CanvasPattern) {
        currentStrokeStyle = typeof value === "string" ? value : currentStrokeStyle;
      },
      fillStyle: "#000",
      globalAlpha: 1,
      font: "10px sans-serif",
      lineJoin: "miter" as CanvasLineJoin,
      textAlign: "start" as CanvasTextAlign,
      textBaseline: "alphabetic" as CanvasTextBaseline,
    });

    const plot = new LightCurvePlot(canvas, 12, {
      xMode: "time",
      trackingMode: "dynamic",
    });
    plot.push(1, 0);
    plot.push(0.999, 1);
    plot.push(0.998, 3);
    plot.push(0.997, 6);

    expect(() => plot.draw()).not.toThrow();
    expect(curveX.length).toBeGreaterThanOrEqual(4);
    const dx1 = curveX[1] - curveX[0];
    const dx2 = curveX[2] - curveX[1];
    expect(dx2).toBeGreaterThan(dx1);
  });

  it("live time mode falls back safely when the last cached finite time is trimmed out by later non-finite samples", () => {
    const canvas = makeMockCanvas(300, 150);
    const plot = new LightCurvePlot(canvas, 6, {
      xMode: "time",
      trackingMode: "live",
      dynamicWindowSec: 2,
      dynamicWindowSamples: 4,
    });

    plot.push(1, 100);
    for (let i = 0; i < 11; i++) {
      plot.push(1 - i * 1e-3);
    }

    const bounds = (plot as any).getVisibleSampleBounds();
    expect(bounds.end - bounds.start).toBe(4);
    expect((plot as any).getVisibleTimeDomain(bounds.start, bounds.end)).toBeNull();
    expect(() => plot.draw()).not.toThrow();
  });

  it("dynamic time mode falls back safely when the earliest cached finite time is trimmed out by later non-finite samples", () => {
    const canvas = makeMockCanvas(300, 150);
    const plot = new LightCurvePlot(canvas, 6, {
      xMode: "time",
      trackingMode: "dynamic",
    });

    plot.push(1, 10);
    plot.push(0.999, 11);
    for (let i = 0; i < 10; i++) {
      plot.push(0.998 - i * 1e-3);
    }

    const bounds = (plot as any).getVisibleSampleBounds();
    expect(bounds.end - bounds.start).toBe(10);
    expect((plot as any).getVisibleTimeDomain(bounds.start, bounds.end)).toBeNull();
    expect(() => plot.draw()).not.toThrow();
  });
});
