// @vitest-environment jsdom
/** Verifies frame loop scheduler contracts across app startup, controls, and runtime integration. */

import { afterEach, expect, it, vi } from "vitest";
import { createFrameLoopController, type FrameLoopState } from "../../src/app/frameLoop";

afterEach(() => vi.unstubAllGlobals());

it("renders once while paused and schedules continuously only while running", () => {
  document.body.innerHTML = `
    <select id="plotMode"><option value="physical">physical</option></select>
    <select id="plotTrackingMode"><option value="dynamic">dynamic</option></select>
    <input id="timeSpeed" value="0" />
  `;
  Object.defineProperty(document, "hidden", { configurable: true, value: false });
  const callbacks: FrameRequestCallback[] = [];
  const request = vi.fn((callback: FrameRequestCallback) => {
    callbacks.push(callback);
    return callbacks.length;
  });
  vi.stubGlobal("requestAnimationFrame", request);
  vi.stubGlobal("cancelAnimationFrame", vi.fn());

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
      orbitFrames: { planetSky: { x: 0, y: 0, z: 0 } },
      uncertaintyFlags: [],
    },
    physicsDiagnostics: {
      ltteConvergence: { enabled: false, status: "disabled" },
      shapiroConvergence: { enabled: false, status: "disabled" },
      integratorStats: { mode: "kepler", nbodyEnabled: false },
      closeEncounterFlags: [],
    },
  } as never;
  const state = {
    running: false,
    t: 0,
    last: 0,
    lastPlottedT: Number.NaN,
    lastPlotMode: null,
    lastPlotTrackingMode: null,
    lastFluxForPlot: 1,
    lastStepV3: null,
    displayFluxScale: 1,
    displayFluxTitle: "Flux",
    noise: { noiseSeed: 1, noiseState: { seed: 1, rng: () => 0 } },
    transitHistory: { planet: [], moon: [] },
  } as unknown as FrameLoopState;
  const controller = createFrameLoopController({
    refs: {
      btnStart: document.createElement("button"),
      timeSpeed: document.getElementById("timeSpeed"),
      timeSpeedMultiplier: null,
      timeSpeedVal: document.createElement("span"),
      plotMode: document.getElementById("plotMode"),
      plotTrackingMode: document.getElementById("plotTrackingMode"),
      tVal: document.createElement("span"),
      fluxVal: document.createElement("span"),
      warnVal: document.createElement("span"),
    } as never,
    renderer: { drawFrameV3: vi.fn(), invalidateSceneScale: vi.fn() } as never,
    plot: {
      clear: vi.fn(),
      setOptions: vi.fn(),
      push: vi.fn(),
      draw: vi.fn(),
    } as never,
    state,
    getSimulation: () => ({ step: () => step, takeStatusMessage: () => undefined }) as never,
    getParams: () => ({ star: { photometry: undefined }, dynamics: {} }) as never,
    getBinaryLabState: () => ({ skyVisible: true }) as never,
    isBinaryModeActive: () => false,
    uiWarningText: () => undefined,
    onSampleStep: () => {},
    renderOcPanel: () => {},
  });

  controller.start();
  expect(request).toHaveBeenCalledTimes(1);
  callbacks.shift()?.(0);
  expect(request).toHaveBeenCalledTimes(1);

  controller.setRunning(true);
  expect(request).toHaveBeenCalledTimes(2);
  callbacks.shift()?.(16);
  expect(request).toHaveBeenCalledTimes(3);
  controller.dispose();
});

it("renders and records a fallback step at the rolled-back simulation time", () => {
  document.body.innerHTML = `
    <select id="plotMode"><option value="physical">physical</option></select>
    <select id="plotTrackingMode"><option value="dynamic">dynamic</option></select>
    <input id="timeSpeed" value="10" />
  `;
  const drawFrameV3 = vi.fn();
  const onSampleStep = vi.fn();
  const state = {
    running: true,
    t: 5,
    last: 0,
    lastPlottedT: Number.NaN,
    lastPlotMode: null,
    lastPlotTrackingMode: null,
    lastFluxForPlot: 1,
    lastStepV3: null,
    displayFluxScale: 1,
    displayFluxTitle: "Flux",
    noise: { noiseSeed: 1, noiseState: { seed: 1, rng: () => 0 } },
    transitHistory: { planet: [], moon: [] },
  } as unknown as FrameLoopState;
  const controller = createFrameLoopController({
    refs: {
      btnStart: document.createElement("button"),
      timeSpeed: document.getElementById("timeSpeed"),
      timeSpeedMultiplier: null,
      timeSpeedVal: document.createElement("span"),
      plotMode: document.getElementById("plotMode"),
      plotTrackingMode: document.getElementById("plotTrackingMode"),
      tVal: document.createElement("span"),
      fluxVal: document.createElement("span"),
      warnVal: document.createElement("span"),
    } as never,
    renderer: { drawFrameV3, invalidateSceneScale: vi.fn() } as never,
    plot: { clear: vi.fn(), setOptions: vi.fn(), push: vi.fn(), draw: vi.fn() } as never,
    state,
    getSimulation: () =>
      ({
        step: () => {
          throw new Error("step failed");
        },
      }) as never,
    getParams: () => ({ star: {}, planet: {}, dynamics: {} }) as never,
    getBinaryLabState: () => ({ skyVisible: true }) as never,
    isBinaryModeActive: () => false,
    uiWarningText: () => undefined,
    onSampleStep,
    renderOcPanel: () => {},
  });

  controller.frame(100);

  const renderedStep = drawFrameV3.mock.calls[0]?.[1] as { tObsSec: number };
  const sampledStep = onSampleStep.mock.calls[0]?.[0] as { tObsSec: number };
  expect(state.t).toBe(5);
  expect(renderedStep.tObsSec).toBe(5);
  expect(sampledStep.tObsSec).toBe(5);
  expect(onSampleStep.mock.calls[0]?.[1]).toBe(5);
  expect(state.running).toBe(false);
  controller.dispose();
});
