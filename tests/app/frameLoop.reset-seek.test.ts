// @vitest-environment jsdom

import { expect, it, vi } from "vitest";

import { createFrameLoopController, type FrameLoopState } from "../../src/app/frameLoop";
import type { SimulationStepV3 } from "../../src/sim/v3";

function installPlotDom(trackingMode: "fixed" | "dynamic" | "live" = "fixed", plotMode = "physical"): void {
  document.body.replaceChildren(
    selectWithOptions("plotTrackingMode", ["fixed", "dynamic", "live"], trackingMode),
    selectWithOptions("plotMode", ["physical", "measured"], plotMode),
    inputWithValue("clampSmearedFlux", "checkbox", ""),
    inputWithValue("timeSpeed", "text", "0"),
  );
}

function selectWithOptions(id: string, values: string[], selectedValue: string): HTMLSelectElement {
  const select = document.createElement("select");
  select.id = id;
  for (const value of values) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    option.selected = value === selectedValue;
    select.appendChild(option);
  }
  return select;
}

function inputWithValue(id: string, type: string, value: string): HTMLInputElement {
  const input = document.createElement("input");
  input.id = id;
  input.type = type;
  input.value = value;
  return input;
}

function makeStep(tObsSec: number, flux = 1): SimulationStepV3 {
  return {
    tObsSec,
    kinematics: { planetSky: { x: 0, y: 0, z: 0 } },
    flux: {
      total: flux,
      transitFactor: flux,
      stellarPreTransit: flux,
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
        total: flux,
        transitFactor: flux,
        stellarPreTransit: flux,
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

it("rebuilds a fixed preview curve on reset", () => {
  installPlotDom("fixed");

  const pushes: Array<{ flux: number; t?: number }> = [];
  const plot = {
    clear: vi.fn(),
    setOptions: vi.fn(),
    push: vi.fn((flux: number, t?: number) => pushes.push({ flux, t })),
    draw: vi.fn(),
  } as any;

  const controller = createFrameLoopController({
    refs: {
      btnStart: document.createElement("button"),
      timeSpeed: document.getElementById("timeSpeed") as HTMLInputElement,
      timeSpeedVal: document.createElement("span"),
      timeSpeedMultiplier: null,
      tVal: document.createElement("span"),
      fluxVal: document.createElement("span"),
      timingHistoryVal: document.createElement("span"),
      warnVal: document.createElement("span"),
      plotMode: document.getElementById("plotMode") as HTMLSelectElement,
      plotTrackingMode: document.getElementById("plotTrackingMode") as HTMLSelectElement,
      clampSmearedFlux: document.getElementById("clampSmearedFlux") as HTMLInputElement,
      plotModeVal: document.createElement("span"),
    } as any,
    renderer: { invalidateSceneScale: vi.fn(), drawFrameV3: vi.fn() } as any,
    plot,
    state: {
      running: false,
      t: 0,
      last: 0,
      lastPlottedT: Number.NaN,
      lastPlotMode: null,
      lastPlotTrackingMode: null,
      lastFluxForPlot: 1,
      lastStepV3: null,
      displayFluxScale: 1,
      displayFluxTitle: "Flux (stellar units)",
      noise: { noiseSeed: 1, noiseState: { seed: 1, rng: () => 0 } },
      transitHistory: { planet: [], moon: [] },
    } as unknown as FrameLoopState,
    getSimulation: () =>
      ({
        step: (t: number) => makeStep(t, 1 - t * 1e-4),
      }) as any,
    getParams: () => ({ star: { photometry: undefined }, dynamics: {} }) as any,
    getBinaryLabState: () => ({ skyVisible: true }) as any,
    isBinaryModeActive: () => false,
    uiWarningText: () => undefined,
    onSampleStep: () => {},
    renderOcPanel: () => {},
  });

  controller.resetSimTimeAndLC({ resetNoise: true });

  expect(pushes.length).toBeGreaterThan(64);
  expect((pushes[0]?.t ?? 0) < 0).toBe(true);
  expect((pushes[pushes.length - 1]?.t ?? 0) > 0).toBe(true);
});

it("adds at least one visible sample on reset outside fixed mode", () => {
  installPlotDom("dynamic");

  const pushes: Array<{ flux: number; t?: number }> = [];
  const plot = {
    clear: vi.fn(),
    setOptions: vi.fn(),
    push: vi.fn((flux: number, t?: number) => pushes.push({ flux, t })),
    draw: vi.fn(),
  } as any;

  const controller = createFrameLoopController({
    refs: {
      btnStart: document.createElement("button"),
      timeSpeed: document.getElementById("timeSpeed") as HTMLInputElement,
      timeSpeedVal: document.createElement("span"),
      timeSpeedMultiplier: null,
      tVal: document.createElement("span"),
      fluxVal: document.createElement("span"),
      timingHistoryVal: document.createElement("span"),
      warnVal: document.createElement("span"),
      plotMode: document.getElementById("plotMode") as HTMLSelectElement,
      plotTrackingMode: document.getElementById("plotTrackingMode") as HTMLSelectElement,
      clampSmearedFlux: document.getElementById("clampSmearedFlux") as HTMLInputElement,
      plotModeVal: document.createElement("span"),
    } as any,
    renderer: { invalidateSceneScale: vi.fn(), drawFrameV3: vi.fn() } as any,
    plot,
    state: {
      running: false,
      t: 0,
      last: 0,
      lastPlottedT: Number.NaN,
      lastPlotMode: null,
      lastPlotTrackingMode: null,
      lastFluxForPlot: 1,
      lastStepV3: null,
      displayFluxScale: 1,
      displayFluxTitle: "Flux (stellar units)",
      noise: { noiseSeed: 1, noiseState: { seed: 1, rng: () => 0 } },
      transitHistory: { planet: [], moon: [] },
    } as unknown as FrameLoopState,
    getSimulation: () =>
      ({
        step: (t: number) => makeStep(t, 1),
      }) as any,
    getParams: () => ({ star: { photometry: undefined }, dynamics: {} }) as any,
    getBinaryLabState: () => ({ skyVisible: true }) as any,
    isBinaryModeActive: () => false,
    uiWarningText: () => undefined,
    onSampleStep: () => {},
    renderOcPanel: () => {},
  });

  controller.resetSimTimeAndLC({ resetNoise: true });

  expect(pushes).toEqual([{ flux: 1, t: 0 }]);
});

it("locks the fixed preview y-range across resets for preset comparison", () => {
  installPlotDom("fixed");

  let slope = 1e-4;
  const setOptions = vi.fn();
  const plot = {
    clear: vi.fn(),
    setOptions,
    push: vi.fn(),
    draw: vi.fn(),
  } as any;

  const controller = createFrameLoopController({
    refs: {
      btnStart: document.createElement("button"),
      timeSpeed: document.getElementById("timeSpeed") as HTMLInputElement,
      timeSpeedVal: document.createElement("span"),
      timeSpeedMultiplier: null,
      tVal: document.createElement("span"),
      fluxVal: document.createElement("span"),
      timingHistoryVal: document.createElement("span"),
      warnVal: document.createElement("span"),
      plotMode: document.getElementById("plotMode") as HTMLSelectElement,
      plotTrackingMode: document.getElementById("plotTrackingMode") as HTMLSelectElement,
      clampSmearedFlux: document.getElementById("clampSmearedFlux") as HTMLInputElement,
      plotModeVal: document.createElement("span"),
    } as any,
    renderer: { invalidateSceneScale: vi.fn(), drawFrameV3: vi.fn() } as any,
    plot,
    state: {
      running: false,
      t: 0,
      last: 0,
      lastPlottedT: Number.NaN,
      lastPlotMode: null,
      lastPlotTrackingMode: null,
      lastFluxForPlot: 1,
      lastStepV3: null,
      displayFluxScale: 1,
      displayFluxTitle: "Flux (stellar units)",
      fixedPlotYRange: undefined,
      fixedPlotYRangeMode: null,
      noise: { noiseSeed: 1, noiseState: { seed: 1, rng: () => 0 } },
      transitHistory: { planet: [], moon: [] },
    } as unknown as FrameLoopState,
    getSimulation: () =>
      ({
        step: (t: number) => makeStep(t, 1 - Math.abs(t) * slope),
      }) as any,
    getParams: () => ({ star: { photometry: undefined }, dynamics: {} }) as any,
    getBinaryLabState: () => ({ skyVisible: true }) as any,
    isBinaryModeActive: () => false,
    uiWarningText: () => undefined,
    onSampleStep: () => {},
    renderOcPanel: () => {},
  });

  controller.resetSimTimeAndLC({ resetNoise: true });
  const firstLockedRange = setOptions.mock.calls
    .map((call) => call[0]?.manualYRange)
    .find((range) => range !== undefined);

  slope = 3e-4;
  controller.resetSimTimeAndLC({ resetNoise: true });
  const lockedRanges = setOptions.mock.calls
    .map((call) => call[0]?.manualYRange)
    .filter((range) => range !== undefined);

  expect(firstLockedRange).toBeDefined();
  expect(lockedRanges[lockedRanges.length - 1]).toEqual(firstLockedRange);
});

it("reuses the live step result when sampling the current timestamp", () => {
  installPlotDom("dynamic", "physical");

  const plot = {
    clear: vi.fn(),
    setOptions: vi.fn(),
    push: vi.fn(),
    draw: vi.fn(),
  } as any;
  let stepCalls = 0;

  const controller = createFrameLoopController({
    refs: {
      btnStart: document.createElement("button"),
      timeSpeed: document.getElementById("timeSpeed") as HTMLInputElement,
      timeSpeedVal: document.createElement("span"),
      timeSpeedMultiplier: null,
      tVal: document.createElement("span"),
      fluxVal: document.createElement("span"),
      timingHistoryVal: document.createElement("span"),
      warnVal: document.createElement("span"),
      plotMode: document.getElementById("plotMode") as HTMLSelectElement,
      plotTrackingMode: document.getElementById("plotTrackingMode") as HTMLSelectElement,
      clampSmearedFlux: document.getElementById("clampSmearedFlux") as HTMLInputElement,
      plotModeVal: document.createElement("span"),
      nOccultersVal: document.createElement("span"),
      vPlanetVal: document.createElement("span"),
      vMoonVal: document.createElement("span"),
    } as any,
    renderer: { invalidateSceneScale: vi.fn(), drawFrameV3: vi.fn() } as any,
    plot,
    state: {
      running: false,
      t: 12,
      last: 0,
      lastPlottedT: Number.NaN,
      lastPlotMode: null,
      lastPlotTrackingMode: null,
      lastFluxForPlot: 1,
      lastStepV3: null,
      displayFluxScale: 1,
      displayFluxTitle: "Flux (stellar units)",
      noise: { noiseSeed: 1, noiseState: { seed: 1, rng: () => 0 } },
      transitHistory: { planet: [], moon: [] },
    } as unknown as FrameLoopState,
    getSimulation: () =>
      ({
        step: (t: number) => {
          stepCalls += 1;
          return makeStep(t, 0.9);
        },
        takeStatusMessage: () => undefined,
      }) as any,
    getParams: () => ({ star: { photometry: undefined }, dynamics: {} }) as any,
    getBinaryLabState: () => ({ skyVisible: true }) as any,
    isBinaryModeActive: () => false,
    uiWarningText: () => undefined,
    onSampleStep: () => {},
    renderOcPanel: () => {},
  });

  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn(() => 1),
  );
  controller.frame(16);

  expect(stepCalls).toBe(1);
});

it("can seek directly to a lesson event time and refresh didactic sampling", () => {
  installPlotDom("dynamic", "physical");

  const pushes: Array<{ flux: number; t?: number }> = [];
  const onSampleStep = vi.fn();
  const controller = createFrameLoopController({
    refs: {
      btnStart: document.createElement("button"),
      timeSpeed: document.getElementById("timeSpeed") as HTMLInputElement,
      timeSpeedVal: document.createElement("span"),
      timeSpeedMultiplier: null,
      tVal: document.createElement("span"),
      fluxVal: document.createElement("span"),
      timingHistoryVal: document.createElement("span"),
      warnVal: document.createElement("span"),
      plotMode: document.getElementById("plotMode") as HTMLSelectElement,
      plotTrackingMode: document.getElementById("plotTrackingMode") as HTMLSelectElement,
      clampSmearedFlux: document.getElementById("clampSmearedFlux") as HTMLInputElement,
      plotModeVal: document.createElement("span"),
      nOccultersVal: document.createElement("span"),
      vPlanetVal: document.createElement("span"),
      vMoonVal: document.createElement("span"),
    } as any,
    renderer: { invalidateSceneScale: vi.fn(), drawFrameV3: vi.fn() } as any,
    plot: {
      clear: vi.fn(),
      setOptions: vi.fn(),
      push: vi.fn((flux: number, t?: number) => pushes.push({ flux, t })),
      draw: vi.fn(),
    } as any,
    state: {
      running: true,
      t: 0,
      last: 0,
      lastPlottedT: Number.NaN,
      lastPlotMode: null,
      lastPlotTrackingMode: null,
      lastFluxForPlot: 1,
      lastStepV3: null,
      displayFluxScale: 1,
      displayFluxTitle: "Flux (stellar units)",
      noise: { noiseSeed: 1, noiseState: { seed: 1, rng: () => 0 } },
      transitHistory: { planet: [], moon: [] },
    } as unknown as FrameLoopState,
    getSimulation: () =>
      ({
        step: (t: number) => makeStep(t, 0.8),
        takeStatusMessage: () => undefined,
      }) as any,
    getParams: () => ({ star: { photometry: undefined }, dynamics: {} }) as any,
    getBinaryLabState: () => ({ skyVisible: true }) as any,
    isBinaryModeActive: () => false,
    uiWarningText: () => undefined,
    onSampleStep,
    renderOcPanel: () => {},
  });

  controller.seekToTime(42, { resetNoise: false });

  expect(pushes[pushes.length - 1]).toEqual({ flux: 0.8, t: 42 });
  expect(onSampleStep).toHaveBeenCalledTimes(1);
  expect(onSampleStep).toHaveBeenCalledWith(expect.objectContaining({ tObsSec: 42 }), 42);
});
