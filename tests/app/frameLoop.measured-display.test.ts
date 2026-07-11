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

it("prefers the shared display-flux diagnostic over local rescaling on direct physical paths", () => {
  installPlotDom("dynamic", "physical");

  const pushes: Array<{ flux: number; t?: number }> = [];
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
      displayFluxScale: 10,
      displayFluxTitle: "Flux (normalized to combined stellar baseline)",
      noise: { noiseSeed: 1, noiseState: { seed: 1, rng: () => 0 } },
      transitHistory: { planet: [], moon: [] },
    } as unknown as FrameLoopState,
    getSimulation: () =>
      ({
        step: (t: number) => ({
          ...makeStep(t, 0.8),
          debug: { displayFluxValue: 0.93 },
        }),
        takeStatusMessage: () => undefined,
      }) as any,
    getParams: () => ({ star: { photometry: undefined }, dynamics: {} }) as any,
    getBinaryLabState: () => ({ skyVisible: true }) as any,
    isBinaryModeActive: () => false,
    uiWarningText: () => undefined,
    onSampleStep: () => {},
    renderOcPanel: () => {},
  });

  controller.seekToTime(42, { resetNoise: false });

  expect(pushes[pushes.length - 1]).toEqual({ flux: 0.93, t: 42 });
});

it("samples measured mode on reset instead of defaulting to the physical display flux", () => {
  installPlotDom("dynamic", "measured");

  const pushes: Array<{ flux: number; t?: number }> = [];
  const fluxVal = document.createElement("span");
  const controller = createFrameLoopController({
    refs: {
      btnStart: document.createElement("button"),
      timeSpeed: document.getElementById("timeSpeed") as HTMLInputElement,
      timeSpeedVal: document.createElement("span"),
      timeSpeedMultiplier: null,
      tVal: document.createElement("span"),
      fluxVal,
      timingHistoryVal: document.createElement("span"),
      warnVal: document.createElement("span"),
      plotMode: document.getElementById("plotMode") as HTMLSelectElement,
      plotTrackingMode: document.getElementById("plotTrackingMode") as HTMLSelectElement,
      clampSmearedFlux: document.getElementById("clampSmearedFlux") as HTMLInputElement,
      plotModeVal: document.createElement("span"),
    } as any,
    renderer: { invalidateSceneScale: vi.fn(), drawFrameV3: vi.fn() } as any,
    plot: {
      clear: vi.fn(),
      setOptions: vi.fn(),
      push: vi.fn((flux: number, t?: number) => pushes.push({ flux, t })),
      draw: vi.fn(),
    } as any,
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
    getParams: () =>
      ({
        star: {
          photometry: {
            instrumentNoise: {
              enabled: true,
              photonNoise: { enabled: false },
              readNoise: { enabled: false },
              correlatedNoise: { enabled: false },
              trends: { enabled: false },
              observer: {
                enabled: true,
                atmosphere: {
                  enabled: true,
                  airmass: { enabled: true, base: 2, extinctionCoeff: 0.2 },
                },
              },
            },
          },
        },
        dynamics: {},
      }) as any,
    getBinaryLabState: () => ({ skyVisible: true }) as any,
    isBinaryModeActive: () => false,
    uiWarningText: () => undefined,
    onSampleStep: () => {},
    renderOcPanel: () => {},
  });

  controller.resetSimTimeAndLC({ resetNoise: true });

  expect(pushes).toHaveLength(1);
  expect(pushes[0]?.t).toBe(0);
  expect(pushes[0]?.flux ?? 1).toBeLessThan(1);
  expect(fluxVal.textContent).toBe((pushes[0]?.flux ?? 0).toFixed(6));
});

it("keeps the last finite measured readout across data gaps and skips non-finite pushes", () => {
  installPlotDom("dynamic", "measured");

  const pushes: Array<{ flux: number; t?: number }> = [];
  const fluxVal = document.createElement("span");
  const controller = createFrameLoopController({
    refs: {
      btnStart: document.createElement("button"),
      timeSpeed: document.getElementById("timeSpeed") as HTMLInputElement,
      timeSpeedVal: document.createElement("span"),
      timeSpeedMultiplier: null,
      tVal: document.createElement("span"),
      fluxVal,
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
        step: (t: number) => makeStep(t, 0.82),
        takeStatusMessage: () => undefined,
      }) as any,
    getParams: () =>
      ({
        star: {
          photometry: {
            instrumentNoise: {
              enabled: true,
              photonNoise: { enabled: false },
              readNoise: { enabled: false },
              correlatedNoise: { enabled: false },
              trends: { enabled: false },
              observer: {
                enabled: true,
                dataGaps: {
                  enabled: true,
                  windowsSec: [{ startSec: 40, endSec: 50 }],
                },
              },
            },
          },
        },
        dynamics: {},
      }) as any,
    getBinaryLabState: () => ({ skyVisible: true }) as any,
    isBinaryModeActive: () => false,
    uiWarningText: () => undefined,
    onSampleStep: () => {},
    renderOcPanel: () => {},
  });

  controller.seekToTime(30, { resetNoise: true });
  controller.seekToTime(45, { resetNoise: false });

  expect(pushes).toEqual([{ flux: 0.82, t: 30 }]);
  expect(fluxVal.textContent).toBe("0.820000");
});

it("continues rendering the primary frame when dynamic visualization fails", () => {
  installPlotDom("dynamic", "physical");

  const warnVal = document.createElement("span");
  const renderer = { invalidateSceneScale: vi.fn(), drawFrameV3: vi.fn() };
  const plot = {
    clear: vi.fn(),
    setOptions: vi.fn(),
    push: vi.fn(),
    draw: vi.fn(),
  };
  const controller = createFrameLoopController({
    refs: {
      btnStart: document.createElement("button"),
      timeSpeed: document.getElementById("timeSpeed") as HTMLInputElement,
      timeSpeedVal: document.createElement("span"),
      timeSpeedMultiplier: null,
      tVal: document.createElement("span"),
      fluxVal: document.createElement("span"),
      timingHistoryVal: document.createElement("span"),
      warnVal,
      plotMode: document.getElementById("plotMode") as HTMLSelectElement,
      plotTrackingMode: document.getElementById("plotTrackingMode") as HTMLSelectElement,
      clampSmearedFlux: document.getElementById("clampSmearedFlux") as HTMLInputElement,
      plotModeVal: document.createElement("span"),
      nOccultersVal: document.createElement("span"),
      vPlanetVal: document.createElement("span"),
      vMoonVal: document.createElement("span"),
    } as any,
    renderer: renderer as any,
    plot: plot as any,
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
    getParams: () => ({ dynamics: {} }) as any,
    getBinaryLabState: () => ({ skyVisible: true }) as any,
    isBinaryModeActive: () => false,
    uiWarningText: () => undefined,
    onSampleStep: () => {},
    renderOcPanel: () => {},
  });

  expect(() => controller.frame(16)).not.toThrow();
  expect(renderer.drawFrameV3).toHaveBeenCalledTimes(1);
  expect(plot.draw).toHaveBeenCalledTimes(1);
  expect(warnVal.textContent).toContain("Visualization overlay failed");
});

it("does not draw the sky scene while binary-lab sky is hidden", () => {
  installPlotDom("fixed", "physical");
  const renderer = { invalidateSceneScale: vi.fn(), drawFrameV3: vi.fn() };
  const plot = {
    clear: vi.fn(),
    setOptions: vi.fn(),
    push: vi.fn(),
    draw: vi.fn(),
  };
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
    renderer: renderer as any,
    plot: plot as any,
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
    getParams: () => ({ dynamics: {} }) as any,
    getBinaryLabState: () => ({ skyVisible: false }) as any,
    isBinaryModeActive: () => true,
    uiWarningText: () => undefined,
    onSampleStep: () => {},
    renderOcPanel: () => {},
  });

  controller.seekToTime(7, { resetNoise: false });

  expect(renderer.drawFrameV3).not.toHaveBeenCalled();
  expect(plot.draw).toHaveBeenCalledTimes(1);
});
