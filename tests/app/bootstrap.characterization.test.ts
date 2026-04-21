// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { installAppShellDocument } from "../helpers/appShell";

const mockState = vi.hoisted(() => ({
  renderers: [] as Array<{ debug: Record<string, boolean> }>,
  frameResetCalls: 0,
  seekCalls: [] as number[],
  runningToggleCalls: 0,
}));

vi.mock("../../src/render/canvas2d", () => {
  class Canvas2DRenderer {
    public debug = {
      enabled: false,
      showObserverDir: false,
      showOcculters: false,
      showImpactParams: false,
      showTDV: false,
      showFluxDecomposition: false,
    };

    private zoomMultiplier = 1;

    constructor() {
      mockState.renderers.push(this as unknown as { debug: Record<string, boolean> });
    }

    public invalidateSceneScale(): void {}

    public setZoomMultiplier(next: number): void {
      this.zoomMultiplier = next;
    }

    public getZoomMultiplier(): number {
      return this.zoomMultiplier;
    }

    public resetZoom(): void {
      this.zoomMultiplier = 1;
    }

    public setAutoFitScene(): void {}
  }

  class LightCurvePlot {
    public clear(): void {}

    public setOptions(): void {}

    public push(): void {}

    public draw(): void {}
  }

  return { Canvas2DRenderer, LightCurvePlot };
});

vi.mock("../../src/app/displayFlux", () => ({
  binaryFluxDisplayBaseline: () => 1,
  fluxDisplayTitle: () => "Flux (stellar units)",
}));

vi.mock("../../src/app/frameLoop", () => ({
  createFrameLoopController: () => {
    let rafId: number | null = null;

    return {
      start: () => {
        rafId = requestAnimationFrame(() => {});
      },
      dispose: () => {
        if (rafId !== null) cancelAnimationFrame(rafId);
      },
      setRunning: () => {
        mockState.runningToggleCalls += 1;
      },
      resetSimTimeAndLC: () => {
        mockState.frameResetCalls += 1;
      },
      seekToTime: (targetSec: number) => {
        mockState.seekCalls.push(targetSec);
      },
    };
  },
}));

vi.mock("../../src/app/v4Runtime", () => ({
  stripUnsupportedPhotometryForV4Runtime: <T>(system: T) => system,
  createSimulationRuntimeV4FromParams: (args: { runtimeMode: "realtime" | "reference" }) => ({
    prepare: async () => {},
    step: () => ({
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
    }),
    setMode: () => {},
    getMode: () => args.runtimeMode,
    getConfig: () => ({
      version: "4",
      mode: "general-lab",
      runtime: { mode: args.runtimeMode },
      bodies: { stars: [{}, {}], planets: [], moons: [] },
      orbits: {
        binary: { a: 1, e: 0, inc: 0, Omega: 0, omega: 0, period: 1, t0: 0 },
        hierarchy: [],
      },
    }),
    dispose: () => {},
    takeStatusMessage: () => undefined,
  }),
}));

function installDom(): void {
  installAppShellDocument();
}

async function flushAsync(): Promise<void> {
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await Promise.resolve();
}

async function flushQuickApply(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 160));
  await flushAsync();
}

async function initTestApp() {
  installDom();
  const { initApp } = await import("../../src/app/bootstrap");
  await initApp();
  await flushAsync();
}

describe("bootstrap runtime contracts", () => {
  beforeEach(() => {
    vi.resetModules();
    mockState.renderers.length = 0;
    mockState.frameResetCalls = 0;
    mockState.seekCalls.length = 0;
    mockState.runningToggleCalls = 0;
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn((cb: FrameRequestCallback) => {
        void cb;
        return Math.floor(Math.random() * 10000) + 1;
      }),
    );
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
  });

  it("keeps renderer debug disabled at startup in normal mode", async () => {
    await initTestApp();

    const renderer = mockState.renderers[0];
    const debugDetails = document.querySelector(
      "details[data-ui-tier='expert']",
    ) as HTMLDetailsElement | null;

    expect((document.getElementById("uiModeSelect") as HTMLSelectElement).value).toBe("normal");
    expect(debugDetails?.hidden).toBe(true);
    expect((document.getElementById("dbgEnabled") as HTMLInputElement).checked).toBe(true);
    expect(renderer?.debug.enabled).toBe(false);
  });

  it("resets runtime mode when returning to normal mode", async () => {
    await initTestApp();

    const uiModeSelect = document.getElementById("uiModeSelect") as HTMLSelectElement;
    const runtimeModeSelect = document.getElementById("runtimeModeSelect") as HTMLSelectElement;
    const runtimeModeTier = runtimeModeSelect.closest("[data-ui-tier='expert']") as HTMLElement | null;

    uiModeSelect.value = "expert";
    uiModeSelect.dispatchEvent(new Event("change", { bubbles: true }));

    runtimeModeSelect.value = "reference";
    runtimeModeSelect.dispatchEvent(new Event("change", { bubbles: true }));
    await flushAsync();

    uiModeSelect.value = "normal";
    uiModeSelect.dispatchEvent(new Event("change", { bubbles: true }));
    await flushAsync();

    expect(uiModeSelect.value).toBe("normal");
    expect(runtimeModeTier?.hidden).toBe(true);
    expect(runtimeModeSelect.value).toBe("realtime");
  });

  it("restores the canonical observer view when returning to normal mode", async () => {
    await initTestApp();

    const uiModeSelect = document.getElementById("uiModeSelect") as HTMLSelectElement;
    const observerFieldset = document.getElementById("observerFieldset") as HTMLElement;
    const observerX = document.getElementById("observerX") as HTMLInputElement;
    const observerY = document.getElementById("observerY") as HTMLInputElement;
    const observerZ = document.getElementById("observerZ") as HTMLInputElement;
    const btnApplyParams = document.getElementById("btnApplyParams") as HTMLButtonElement;

    expect(observerFieldset.hidden).toBe(true);
    expect(observerX.value).toBe("0");
    expect(observerY.value).toBe("0");
    expect(observerZ.value).toBe("1");

    uiModeSelect.value = "expert";
    uiModeSelect.dispatchEvent(new Event("change", { bubbles: true }));
    await flushAsync();

    expect(observerFieldset.hidden).toBe(false);

    observerX.value = "1";
    observerY.value = "0";
    observerZ.value = "0";
    btnApplyParams.click();
    await flushAsync();

    expect(observerX.value).toBe("1");
    expect(observerY.value).toBe("0");
    expect(observerZ.value).toBe("0");

    uiModeSelect.value = "normal";
    uiModeSelect.dispatchEvent(new Event("change", { bubbles: true }));
    await flushAsync();

    expect(observerFieldset.hidden).toBe(true);
    expect(observerX.value).toBe("0");
    expect(observerY.value).toBe("0");
    expect(observerZ.value).toBe("1");
  });

  it("reloads the visible form when Reset params is clicked", async () => {
    await initTestApp();

    const planetR = document.getElementById("planetR") as HTMLInputElement;
    const btnApplyParams = document.getElementById("btnApplyParams") as HTMLButtonElement;
    const btnResetParams = document.getElementById("btnResetParams") as HTMLButtonElement;
    const before = planetR.value;

    planetR.value = "123456789";
    planetR.dispatchEvent(new Event("input", { bubbles: true }));
    btnApplyParams.click();
    await flushAsync();

    btnResetParams.click();
    await flushAsync();

    expect(before).toBe("150000000");
    expect(planetR.value).toBe(before);
  });

  it("auto-applies normal-mode quick controls without pressing Apply parameters", async () => {
    await initTestApp();

    const quickPlanetR = document.getElementById("quickPlanetR") as HTMLInputElement;
    const planetR = document.getElementById("planetR") as HTMLInputElement;
    const resetsBefore = mockState.frameResetCalls;

    quickPlanetR.value = String(Number(quickPlanetR.value) * 1.05);
    quickPlanetR.dispatchEvent(new Event("input", { bubbles: true }));
    await flushQuickApply();

    expect(Number(planetR.value)).toBeCloseTo(Number(quickPlanetR.value), 6);
    expect(mockState.frameResetCalls).toBeGreaterThan(resetsBefore);
  });

  it("rebinds to the live shell after the app shell is remounted", async () => {
    await initTestApp();

    const { initApp } = await import("../../src/app/bootstrap");
    installDom();
    await initApp();
    await flushAsync();

    const btnStart = document.getElementById("btnStart") as HTMLButtonElement;
    const runningTogglesBefore = mockState.runningToggleCalls;

    btnStart.click();
    await flushAsync();

    expect(mockState.runningToggleCalls - runningTogglesBefore).toBe(1);
  });

  it("cleans up bootstrap side effects before re-initializing on the same DOM", async () => {
    const { initApp } = await import("../../src/app/bootstrap");

    installDom();
    await initApp();
    await flushAsync();

    const sliderRoot = document.getElementById("sliderRoot") as HTMLElement;
    const btnReset = document.getElementById("btnReset") as HTMLButtonElement;
    const rafCallsAfterFirstInit = vi.mocked(requestAnimationFrame).mock.calls.length;

    await initApp();
    await flushAsync();

    const resetsBeforeClick = mockState.frameResetCalls;
    btnReset.click();
    await flushAsync();

    expect(sliderRoot.isConnected).toBe(true);
    expect(mockState.frameResetCalls - resetsBeforeClick).toBe(1);
    expect(vi.mocked(cancelAnimationFrame)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(requestAnimationFrame).mock.calls.length).toBe(rafCallsAfterFirstInit + 1);
  });

  it("lets the learner adjust guidance level without changing lessons", async () => {
    await initTestApp();

    const hintLevel = document.getElementById("didHintLevelSelect") as HTMLSelectElement;
    const hintMore = document.getElementById("didHintMoreBtn") as HTMLButtonElement;
    const hintLess = document.getElementById("didHintLessBtn") as HTMLButtonElement;

    expect(hintLevel.value).toBe("L1");

    hintMore.click();
    await flushAsync();
    expect(hintLevel.value).toBe("L2");

    hintMore.click();
    await flushAsync();
    expect(hintLevel.value).toBe("L3");

    hintLess.click();
    await flushAsync();
    expect(hintLevel.value).toBe("L2");
  });

  it("separates simulation surfaces from lab surfaces under the new product mode contract", async () => {
    await initTestApp();

    const productModeSelect = document.getElementById("productModeSelect") as HTMLSelectElement;
    const uiModeSelect = document.getElementById("uiModeSelect") as HTMLSelectElement;
    const uiModeShell = (document.getElementById("uiModeSelect") as HTMLSelectElement).closest(
      "[data-product-mode='simulation']",
    ) as HTMLElement | null;
    const presetShell = (document.getElementById("presetSelect") as HTMLSelectElement).closest(
      "[data-product-mode='simulation']",
    ) as HTMLElement | null;
    const labTypeShell = (document.getElementById("simModeSelect") as HTMLSelectElement).closest(
      "[data-product-mode='lab']",
    ) as HTMLElement | null;
    const didacticsPanel = (document.getElementById("didLessonSelect") as HTMLSelectElement).closest(
      "[data-product-mode='lab']",
    ) as HTMLElement | null;
    const binaryControls = document.getElementById("didBinaryControls") as HTMLElement | null;
    const paramForm = document.getElementById("paramForm") as HTMLElement | null;
    const binaryLabParamNotice = document.getElementById("binaryLabParamNotice") as HTMLElement | null;
    const ocSection = document.getElementById("ocSection") as HTMLElement | null;

    expect(productModeSelect.value).toBe("simulation");
    expect(uiModeShell?.hidden).toBe(false);
    expect(presetShell?.hidden).toBe(false);
    expect(labTypeShell?.hidden).toBe(true);
    expect(didacticsPanel?.hidden).toBe(true);
    expect(paramForm?.hidden).toBe(false);
    expect(binaryLabParamNotice?.hidden).toBe(true);

    uiModeSelect.value = "expert";
    uiModeSelect.dispatchEvent(new Event("change", { bubbles: true }));
    await flushAsync();
    expect(ocSection?.hidden).toBe(false);

    productModeSelect.value = "lab";
    productModeSelect.dispatchEvent(new Event("change", { bubbles: true }));
    await flushAsync();

    expect(uiModeShell?.hidden).toBe(true);
    expect(presetShell?.hidden).toBe(true);
    expect(labTypeShell?.hidden).toBe(false);
    expect(didacticsPanel?.hidden).toBe(false);
    expect(binaryControls?.hidden).toBe(true);
    expect(paramForm?.hidden).toBe(false);
    expect(binaryLabParamNotice?.hidden).toBe(true);
    expect(ocSection?.hidden).toBe(false);

    const simModeSelect = document.getElementById("simModeSelect") as HTMLSelectElement;
    simModeSelect.value = "binary-lab";
    simModeSelect.dispatchEvent(new Event("change", { bubbles: true }));
    await flushAsync();

    expect(binaryControls?.hidden).toBe(false);
    expect(paramForm?.hidden).toBe(true);
    expect(binaryLabParamNotice?.hidden).toBe(false);
    expect(ocSection?.hidden).toBe(true);
  });

  it("jumps to the selected lesson event through the frame controller", async () => {
    await initTestApp();

    const eventSelect = document.getElementById("didEventTargetSelect") as HTMLSelectElement;
    const jumpBtn = document.getElementById("didJumpEventBtn") as HTMLButtonElement;

    for (const option of Array.from(eventSelect.options)) option.disabled = false;
    eventSelect.innerHTML = '<option value="moonMidTransit" selected>Moon mid-transit @ 300 s</option>';
    jumpBtn.disabled = false;

    const didacticsModule = await import("../../src/app/didactics");
    const resolveSpy = vi.spyOn(didacticsModule, "resolveSelectedDidacticEventTime");
    resolveSpy.mockReturnValue(300);

    jumpBtn.click();
    await flushAsync();

    expect(mockState.seekCalls).toEqual([300]);
  });
});
