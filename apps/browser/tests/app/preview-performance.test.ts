/** Measures fixed-preview work independently of animation and preserves band output evidence. */
import { describe, expect, it, vi } from "vitest";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { getPresetById } from "../../src/application/catalog/presets";
import { createSimulationRuntimeV4FromParams } from "../../src/application/runtime/v4Runtime";
import { createBootstrapAppState } from "../../src/composition/appState";
import {
  resetSimTimeAndLCForContext,
  seekToTimeForContext,
} from "../../src/presentation/playback/frameLoopResetSeek";
import { invalidateFixedPreview } from "../../src/presentation/playback/fixedPreviewCache";
import { frameForContext } from "../../src/presentation/playback/frameLoopFrame";
import type { FrameLoopContext } from "../../src/presentation/playback/frameLoopControllerTypes";
import {
  buildBandConfigurations,
  createBandSamplingService,
} from "../../src/application/runtime/chromaticSampling";
import { styleBandSamples } from "../../src/presentation/playback/chromaticOverlay";
vi.mock("../../src/presentation/playback/frameLoopControllerShared", async (original) => ({
  ...(await original<object>()),
  drawStepAndReadouts: vi.fn(),
  setRuntimeStatusWarning: vi.fn(),
  readCurrentPlotModes: () => ({ plotMode: "physical", trackingMode: "fixed" }),
}));
function workload() {
  const params = structuredClone(getPresetById("default").params);
  const simulation = createSimulationRuntimeV4FromParams({
    system: params,
    binaryMode: false,
    runtimeMode: "realtime",
  });
  let steps = 0;
  const step = simulation.step;
  simulation.step = (t) => {
    steps++;
    return step(t);
  };
  const state = createBootstrapAppState(params);
  const ctx = {
    state,
    getParams: () => params,
    getSimulation: () => simulation,
    refs: {
      timeSpeed: { value: "1" },
      timeSpeedVal: { textContent: "" },
      warnVal: { textContent: "" },
      tVal: { textContent: "" },
      fluxVal: { textContent: "" },
    },
    plot: {
      clear: vi.fn(),
      setOptions() {},
      push() {},
      setOverlaySeries: vi.fn(),
      setBadges: vi.fn(),
      setComparisonInset: vi.fn(),
    },
    renderer: { invalidateSceneScale() {}, setDidacticOverlay: vi.fn() },
    renderOcPanel() {},
    setRunning(next: boolean) {
      state.running = next;
    },
    sampleFluxForPlot: ((_s, _p, _m, _t, _dt, _noise, sampled) =>
      sampled!.flux.total) satisfies FrameLoopContext["sampleFluxForPlot"],
    queueNextFrame() {},
    onSampleStep() {},
  } as unknown as FrameLoopContext;
  return { ctx, count: () => steps };
}
describe("preview work and performance", () => {
  it("reuses consecutive fixed previews", () => {
    const { ctx, count } = workload();
    frameForContext(ctx, 0);
    const first = count();
    frameForContext(ctx, 16);
    expect(count() - first).toBe(2);
    expect(ctx.plot.clear).toHaveBeenCalledTimes(1);
    expect(first).toBe(259);
  });
  it("rebuilds once after reset generation, scale, measurement, seed, or runtime changes", () => {
    const { ctx, count } = workload();
    frameForContext(ctx, 0);
    for (const invalidate of [
      () => invalidateFixedPreview(ctx.state),
      () => ctx.getSimulation().setMode("reference"),
      () => {
        ctx.refs.clampSmearedFlux = { checked: true } as HTMLInputElement;
      },
      () => {
        ctx.state.displayFluxScale = 2;
      },
      () => {
        ctx.state.noise.noiseSeed++;
      },
      () => {
        ctx.getParams().star.photometry = { ...ctx.getParams().star.photometry, cadenceSec: 61 };
      },
      () => {
        const previous = ctx.getSimulation();
        ctx.getSimulation = () => ({ ...previous });
      },
    ]) {
      invalidate();
      // Runtime replacement uses one stable object per generation.
      const runtime = ctx.getSimulation();
      ctx.getSimulation = () => runtime;
      const before = count();
      frameForContext(ctx, 16);
      expect(count() - before).toBe(259);
      const after = count();
      frameForContext(ctx, 32);
      expect(count() - after).toBe(2);
    }
  });
  it("reset and seek validate exactly one newly built fixed preview", () => {
    const { ctx, count } = workload();
    frameForContext(ctx, 0);
    for (const action of [() => resetSimTimeAndLCForContext(ctx), () => seekToTimeForContext(ctx, 120)]) {
      const before = count();
      const generation = ctx.state.previewGeneration ?? 0;
      action();
      expect(count() - before).toBe(258);
      expect(ctx.state.fixedPreviewKey?.generation).toBe(generation + 1);
      const rebuilt = count();
      frameForContext(ctx, 16);
      expect(count() - rebuilt).toBe(2);
    }
  });
  it("refreshes live fixed annotations and comparison presentation without resampling", () => {
    const { ctx, count } = workload();
    frameForContext(ctx, 0);
    const firstScene = vi.mocked(ctx.renderer.setDidacticOverlay).mock.calls.at(-1)?.[0];
    const comparison = { id: "comparison", label: "comparison", color: "blue", samples: [{ t: 0, flux: 1 }] };
    ctx.state.t = 120;
    ctx.state.comparisonCurveSeries = [comparison];
    ctx.state.comparisonBadges = [{ label: "comparison badge", color: "blue" }];
    const before = count();
    frameForContext(ctx, 16);
    expect(count() - before).toBe(2);
    expect(ctx.plot.clear).toHaveBeenCalledTimes(1);
    expect(vi.mocked(ctx.plot.setOverlaySeries).mock.calls.at(-1)?.[0]).toContain(comparison);
    expect(vi.mocked(ctx.plot.setBadges).mock.calls.at(-1)?.[0]).toContainEqual(
      ctx.state.comparisonBadges[0],
    );
    expect(vi.mocked(ctx.renderer.setDidacticOverlay).mock.calls.at(-1)?.[0]).not.toEqual(firstScene);
  });
  it("does not validate failed previews", () => {
    const { ctx } = workload();
    ctx.sampleFluxForPlot = () => {
      throw new Error("preview sampling failed");
    };
    frameForContext(ctx, 0);
    expect(ctx.state.fixedPreviewKey).toBeUndefined();
    expect(ctx.refs.warnVal!.textContent).toContain("Fixed preview unavailable");
  });
  it("records reproducible preview and multiband workloads when requested", () => {
    if (!process.env.OTHERLIGHT_BENCHMARK_REPORT) return;
    const durations: number[] = [];
    const counts: number[] = [];
    for (let repetition = -2; repetition < 9; repetition++) {
      const { ctx, count } = workload();
      const start = performance.now();
      for (let i = 0; i < 4; i++) frameForContext(ctx, i * 16);
      if (repetition >= 0) {
        durations.push(performance.now() - start);
        counts.push(count());
      }
    }
    const params = structuredClone(getPresetById("default").params);
    params.star.photometry = {
      ...params.star.photometry,
      spectralBandpass: { enabled: true, lambdaNm: [450, 550, 700], weights: [1, 1, 1] },
    };
    const times = Array.from({ length: 96 }, (_, i) => -10000 + (i * 20000) / 95);
    const bandMs: number[] = [];
    let output;
    for (let i = -2; i < 9; i++) {
      const start = performance.now();
      output = styleBandSamples(createBandSamplingService(buildBandConfigurations(params))(times));
      if (i >= 0) bandMs.push(performance.now() - start);
    }
    const retained = createBandSamplingService(buildBandConfigurations(params));
    const retainedBandMs: number[] = [];
    for (let i = -2; i < 9; i++) {
      const start = performance.now();
      const result = styleBandSamples(retained(times));
      if (i >= 0) retainedBandMs.push(performance.now() - start);
      expect(result).toEqual(output);
    }
    // A separate pass reports heap deltas; no allocation tracing contaminates latency.
    const memoryBefore = process.memoryUsage();
    const memoryWorkload = workload();
    for (let i = 0; i < 4; i++) frameForContext(memoryWorkload.ctx, i * 16);
    const memoryAfter = process.memoryUsage();
    mkdirSync(dirname(resolve(process.env.OTHERLIGHT_BENCHMARK_REPORT)), { recursive: true });
    writeFileSync(
      process.env.OTHERLIGHT_BENCHMARK_REPORT,
      JSON.stringify(
        {
          node: process.version,
          platform: process.platform,
          seed: workload().ctx.state.noise.noiseSeed,
          warmup: 2,
          repetitions: 9,
          workload: { fixedFrames: 4, previewPoints: 256, bands: 3, bandPoints: 96 },
          previewMs: durations,
          steps: counts,
          bandMs,
          retainedBandMs,
          memory: {
            method: "separate process.memoryUsage pass; GC uncontrolled",
            before: memoryBefore,
            after: memoryAfter,
          },
          output,
        },
        null,
        2,
      ),
    );
  });
});
