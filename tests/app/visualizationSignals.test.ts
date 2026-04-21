import { describe, expect, it } from "vitest";

import type { SimulationStepV3 } from "../../src/sim/v3/types";
import {
  buildComparisonInset,
  componentOverlaySeriesFromSamples,
  sampleSeriesFromRuntime,
} from "../../src/app/visualizationSignals";

// Minimal step factory — only fills in the fields used by visualizationSignals
function makeStep(
  t: number,
  overrides: Partial<SimulationStepV3["renderSignals"]["fluxComponents"]> = {},
): { t: number; step: SimulationStepV3 } {
  const fluxComponents = {
    transitFactor: 1,
    stellarPreTransit: 1,
    stellarVariability: 0,
    planetPhase: 0,
    moonPhase: 0,
    forwardScattering: 0,
    ringScattering: 0,
    refraction: 0,
    total: 1,
    ...overrides,
  };
  const step: SimulationStepV3 = {
    tObsSec: t,
    kinematics: { planetSky: { x: 0, y: 0, z: 0 } },
    flux: {
      total: fluxComponents.total,
      transitFactor: fluxComponents.transitFactor,
      stellarPreTransit: fluxComponents.stellarPreTransit,
      stellarVariability: fluxComponents.stellarVariability,
      planetPhase: fluxComponents.planetPhase,
      moonPhase: fluxComponents.moonPhase,
      forwardScattering: fluxComponents.forwardScattering,
      ringScattering: fluxComponents.ringScattering,
      refraction: fluxComponents.refraction,
    },
    renderSignals: {
      occulterGeometry: [],
      eventMarkers: [],
      timingMarkers: [],
      visibilityFractions: {},
      fluxComponents,
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
  return { t, step };
}

describe("componentOverlaySeriesFromSamples", () => {
  it("returns exactly three series with stable IDs", () => {
    const samples = [makeStep(0), makeStep(1000), makeStep(2000)];
    const series = componentOverlaySeriesFromSamples(samples);
    expect(series).toHaveLength(3);
    const ids = series.map((s) => s.id);
    expect(ids).toContain("stellar-baseline");
    expect(ids).toContain("transit-only");
    expect(ids).toContain("scattering-shoulder");
  });

  it("stellar-baseline tracks stellarPreTransit", () => {
    const samples = [makeStep(0, { stellarPreTransit: 0.99 }), makeStep(1000, { stellarPreTransit: 0.98 })];
    const series = componentOverlaySeriesFromSamples(samples);
    const baseline = series.find((s) => s.id === "stellar-baseline")!;
    expect(baseline.samples[0].flux).toBeCloseTo(0.99, 10);
    expect(baseline.samples[1].flux).toBeCloseTo(0.98, 10);
  });

  it("transit-only applies transitFactor", () => {
    const samples = [makeStep(0, { stellarPreTransit: 1.0, transitFactor: 0.98 })];
    const series = componentOverlaySeriesFromSamples(samples);
    const transitOnly = series.find((s) => s.id === "transit-only")!;
    expect(transitOnly.samples[0].flux).toBeCloseTo(0.98, 10);
  });

  it("scattering-shoulder adds forwardScattering and ringScattering", () => {
    const samples = [
      makeStep(0, {
        stellarPreTransit: 1.0,
        transitFactor: 0.99,
        forwardScattering: 0.002,
        ringScattering: 0.001,
        refraction: 0,
      }),
    ];
    const series = componentOverlaySeriesFromSamples(samples);
    const shoulder = series.find((s) => s.id === "scattering-shoulder")!;
    expect(shoulder.samples[0].flux).toBeCloseTo(0.99 + 0.002 + 0.001, 8);
  });

  it("guards against non-finite refraction", () => {
    const samples = [
      makeStep(0, {
        stellarPreTransit: 1.0,
        transitFactor: 1.0,
        forwardScattering: 0,
        ringScattering: 0,
        refraction: NaN,
      }),
    ];
    const series = componentOverlaySeriesFromSamples(samples);
    const shoulder = series.find((s) => s.id === "scattering-shoulder")!;
    expect(Number.isFinite(shoulder.samples[0].flux)).toBe(true);
  });

  it("each series has a sample per input step", () => {
    const samples = Array.from({ length: 5 }, (_, i) => makeStep(i * 500));
    const series = componentOverlaySeriesFromSamples(samples);
    for (const s of series) {
      expect(s.samples).toHaveLength(5);
    }
  });

  it("preserves t values", () => {
    const samples = [makeStep(0), makeStep(3600), makeStep(7200)];
    const series = componentOverlaySeriesFromSamples(samples);
    for (const s of series) {
      expect(s.samples.map((p) => p.t)).toEqual([0, 3600, 7200]);
    }
  });
});

describe("buildComparisonInset", () => {
  it("returns undefined when both series are undefined", () => {
    expect(buildComparisonInset({ a: undefined, b: undefined })).toBeUndefined();
  });

  it("returns undefined when a is undefined", () => {
    const b = componentOverlaySeriesFromSamples([makeStep(0)])[0];
    expect(buildComparisonInset({ a: undefined, b })).toBeUndefined();
  });

  it("returns undefined when b is undefined", () => {
    const a = componentOverlaySeriesFromSamples([makeStep(0)])[0];
    expect(buildComparisonInset({ a, b: undefined })).toBeUndefined();
  });

  it("returns undefined when either series has no samples", () => {
    const emptySeries = { id: "x", label: "x", color: "#000", style: "solid" as const, samples: [] };
    const filled = componentOverlaySeriesFromSamples([makeStep(0)])[0];
    expect(buildComparisonInset({ a: emptySeries, b: filled })).toBeUndefined();
    expect(buildComparisonInset({ a: filled, b: emptySeries })).toBeUndefined();
  });

  it("computes B-A delta correctly", () => {
    const times = [0, 1000, 2000];
    const a = {
      id: "a",
      label: "A",
      color: "#aaa",
      style: "solid" as const,
      samples: times.map((t) => ({ t, flux: 0.97 })),
    };
    const b = {
      id: "b",
      label: "B",
      color: "#bbb",
      style: "solid" as const,
      samples: times.map((t) => ({ t, flux: 0.99 })),
    };
    const inset = buildComparisonInset({ a, b });
    expect(inset).toBeDefined();
    expect(inset!.title).toBe("A/B delta");
    expect(inset!.series).toHaveLength(1);
    for (const pt of inset!.series[0].samples) {
      expect(pt.flux).toBeCloseTo(0.02, 8);
    }
  });

  it("skips sample pairs with non-finite flux values", () => {
    const a = {
      id: "a",
      label: "A",
      color: "#aaa",
      style: "solid" as const,
      samples: [
        { t: 0, flux: 0.97 },
        { t: 1000, flux: NaN },
      ],
    };
    const b = {
      id: "b",
      label: "B",
      color: "#bbb",
      style: "solid" as const,
      samples: [
        { t: 0, flux: 0.99 },
        { t: 1000, flux: 0.98 },
      ],
    };
    const inset = buildComparisonInset({ a, b });
    expect(inset!.series[0].samples).toHaveLength(1);
  });
});

describe("sampleSeriesFromRuntime", () => {
  it("creates a series with the correct structure", () => {
    const runtime = { step: (t: number) => makeStep(t).step };
    const times = [0, 1000, 2000];
    const series = sampleSeriesFromRuntime(runtime, times, "Total Flux", "#ff0000", (s) => s.flux.total);

    expect(series.label).toBe("Total Flux");
    expect(series.color).toBe("#ff0000");
    expect(series.id).toBe("total-flux");
    expect(series.samples).toHaveLength(3);
  });

  it("id is derived from label (lowercased, spaces → dashes)", () => {
    const runtime = { step: (t: number) => makeStep(t).step };
    const series = sampleSeriesFromRuntime(runtime, [0], "My Series Label", "#000", (s) => s.flux.total);
    expect(series.id).toBe("my-series-label");
  });

  it("calls fluxSelector with each step", () => {
    const runtime = { step: (t: number) => makeStep(t, { transitFactor: 0.95 }).step };
    const series = sampleSeriesFromRuntime(runtime, [0], "transit", "#aaa", (s) => s.flux.transitFactor);
    expect(series.samples[0].flux).toBeCloseTo(0.95, 8);
  });

  it("preserves supplied style", () => {
    const runtime = { step: (t: number) => makeStep(t).step };
    const series = sampleSeriesFromRuntime(runtime, [0], "x", "#000", (s) => s.flux.total, "dashed");
    expect(series.style).toBe("dashed");
  });

  it("defaults to solid style when not provided", () => {
    const runtime = { step: (t: number) => makeStep(t).step };
    const series = sampleSeriesFromRuntime(runtime, [0], "x", "#000", (s) => s.flux.total);
    expect(series.style).toBe("solid");
  });

  it("maps t values into sample t fields", () => {
    const times = [100, 200, 300];
    const runtime = { step: (t: number) => makeStep(t).step };
    const series = sampleSeriesFromRuntime(runtime, times, "x", "#000", (s) => s.flux.total);
    expect(series.samples.map((p) => p.t)).toEqual(times);
  });
});
