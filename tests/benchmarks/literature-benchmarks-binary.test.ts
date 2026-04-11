import { describe, expect, it } from "vitest";

import { DEFAULT_BINARY_LAB_CONFIG_V4 } from "../../src/app/binaryLab";
import { binaryFluxDisplayBaseline, scaleFluxForDisplay } from "../../src/app/displayFlux";
import { circleIntersectionArea } from "../../src/photometry/mutualEvents";
import { resolveDetachedBinaryLuminosities } from "../../src/photometry/stellarBandFlux";
import { createSimulationV4 } from "../../src/sim/v4/runtime";
import type { SimulationConfigV4 } from "../../src/sim/v4/types";
import type { SimulationStepV3 } from "../../src/sim/v3";

async function withBinaryLabSimulation<T>(
  run: (args: { baseline: number; fluxAt: (tSec: number) => number }) => T,
): Promise<T> {
  const sim = createSimulationV4(DEFAULT_BINARY_LAB_CONFIG_V4);
  await sim.prepare();
  const baseline = binaryFluxDisplayBaseline(DEFAULT_BINARY_LAB_CONFIG_V4) ?? 1;
  try {
    return run({
      baseline,
      fluxAt: (tSec: number) => scaleFluxForDisplay(sim.step(tSec).flux.total, baseline),
    });
  } finally {
    // createSimulationV4() has no disposable resources; keep the helper symmetric
    // with the app runtime without inventing a fake dispose contract.
  }
}

function buildUnequalBinaryBenchmarkConfig(band: "g" | "r"): SimulationConfigV4 {
  return {
    version: "4",
    mode: "detached-binary-lab",
    runtime: { mode: "realtime" },
    observer: { dir: { x: 1, y: 0, z: 0 } },
    bodies: {
      stars: [
        {
          id: "star-a",
          r: 1.0,
          m: 1.25,
          teffK: 6_600,
          loggCgs: 4.1,
          metallicityDex: 0,
          passband: band,
        },
        {
          id: "star-b",
          r: 0.78,
          m: 0.95,
          teffK: 5_050,
          loggCgs: 4.55,
          metallicityDex: -0.1,
          passband: band,
        },
      ],
      planets: [],
      moons: [],
    },
    orbits: {
      binary: { a: 0.2, e: 0, inc: 0, Omega: 0, omega: 0, period: 10, t0: 0 },
      hierarchy: [],
    },
    photometry: {
      baselineFlux: 1,
      gridRes: 240,
      limbDarkeningModel: {
        bandpass: band,
        default: { kind: "quadratic", u1: band === "g" ? 0.44 : 0.34, u2: band === "g" ? 0.21 : 0.23 },
      },
    },
  };
}

function buildSymmetricBinaryBenchmarkConfig(band: "g" | "r"): SimulationConfigV4 {
  return {
    version: "4",
    mode: "detached-binary-lab",
    runtime: { mode: "realtime" },
    observer: { dir: { x: 1, y: 0, z: 0 } },
    bodies: {
      stars: [
        {
          id: "star-a",
          r: 0.92,
          m: 1.08,
          teffK: 5_850,
          loggCgs: 4.35,
          metallicityDex: 0,
          passband: band,
        },
        {
          id: "star-b",
          r: 0.92,
          m: 1.08,
          teffK: 5_850,
          loggCgs: 4.35,
          metallicityDex: 0,
          passband: band,
        },
      ],
      planets: [],
      moons: [],
    },
    orbits: {
      binary: { a: 0.2, e: 0, inc: 0, Omega: 0, omega: 0, period: 10, t0: 0 },
      hierarchy: [],
    },
    photometry: {
      baselineFlux: 1,
      gridRes: 240,
      limbDarkeningModel: {
        bandpass: band,
        default: { kind: "quadratic", u1: 0.32, u2: 0.18 },
      },
    },
  };
}

function buildBlueSecondaryBinaryBenchmarkConfig(band: "g" | "r"): SimulationConfigV4 {
  return {
    version: "4",
    mode: "detached-binary-lab",
    runtime: { mode: "realtime" },
    observer: { dir: { x: 1, y: 0, z: 0 } },
    bodies: {
      stars: [
        {
          id: "star-a",
          r: 1.08,
          m: 1.18,
          teffK: 5_550,
          loggCgs: 4.22,
          metallicityDex: 0,
          passband: band,
        },
        {
          id: "star-b",
          r: 0.74,
          m: 1.02,
          teffK: 7_350,
          loggCgs: 4.48,
          metallicityDex: -0.05,
          passband: band,
        },
      ],
      planets: [],
      moons: [],
    },
    orbits: {
      binary: { a: 0.2, e: 0, inc: 0, Omega: 0, omega: 0, period: 10, t0: 0 },
      hierarchy: [],
    },
    photometry: {
      baselineFlux: 1,
      gridRes: 240,
      limbDarkeningModel: {
        bandpass: band,
        default: { kind: "quadratic", u1: band === "g" ? 0.39 : 0.31, u2: band === "g" ? 0.2 : 0.22 },
      },
    },
  };
}

function buildSameSedUnequalBinaryBenchmarkConfig(band: "g" | "r"): SimulationConfigV4 {
  return {
    version: "4",
    mode: "detached-binary-lab",
    runtime: { mode: "realtime" },
    observer: { dir: { x: 1, y: 0, z: 0 } },
    bodies: {
      stars: [
        {
          id: "star-a",
          r: 1.06,
          m: 1.14,
          teffK: 5_900,
          loggCgs: 4.28,
          metallicityDex: 0,
          passband: band,
        },
        {
          id: "star-b",
          r: 0.72,
          m: 0.92,
          teffK: 5_900,
          loggCgs: 4.5,
          metallicityDex: 0,
          passband: band,
        },
      ],
      planets: [],
      moons: [],
    },
    orbits: {
      binary: { a: 0.2, e: 0, inc: 0, Omega: 0, omega: 0, period: 10, t0: 0 },
      hierarchy: [],
    },
    photometry: {
      baselineFlux: 1,
      gridRes: 240,
      limbDarkeningModel: {
        bandpass: band,
        default: { kind: "quadratic", u1: 0.33, u2: 0.19 },
      },
    },
  };
}

function buildSameSedUnequalExplicitLawBinaryBenchmarkConfig(band: "g" | "r"): SimulationConfigV4 {
  return {
    version: "4",
    mode: "detached-binary-lab",
    runtime: { mode: "realtime" },
    observer: { dir: { x: 1, y: 0, z: 0 } },
    bodies: {
      stars: [
        {
          id: "star-a",
          r: 1.06,
          m: 1.14,
          teffK: 5_900,
          loggCgs: 4.28,
          metallicityDex: 0,
          passband: band,
        },
        {
          id: "star-b",
          r: 0.72,
          m: 0.92,
          teffK: 5_900,
          loggCgs: 4.5,
          metallicityDex: 0,
          passband: band,
        },
      ],
      planets: [],
      moons: [],
    },
    orbits: {
      binary: { a: 0.2, e: 0, inc: 0, Omega: 0, omega: 0, period: 10, t0: 0 },
      hierarchy: [],
    },
    photometry: {
      baselineFlux: 1,
      gridRes: 240,
      limbDarkeningModel: {
        bandpass: band,
        bands: {
          g: { kind: "quadratic", u1: 0.33, u2: 0.19 },
          r: { kind: "quadratic", u1: 0.33, u2: 0.19 },
        },
      },
    },
  };
}

function buildSameSedSymmetricBinaryBenchmarkConfig(band: "g" | "r"): SimulationConfigV4 {
  return {
    version: "4",
    mode: "detached-binary-lab",
    runtime: { mode: "realtime" },
    observer: { dir: { x: 1, y: 0, z: 0 } },
    bodies: {
      stars: [
        {
          id: "star-a",
          r: 0.92,
          m: 1.03,
          teffK: 5_900,
          loggCgs: 4.36,
          metallicityDex: 0,
          passband: band,
        },
        {
          id: "star-b",
          r: 0.92,
          m: 1.03,
          teffK: 5_900,
          loggCgs: 4.36,
          metallicityDex: 0,
          passband: band,
        },
      ],
      planets: [],
      moons: [],
    },
    orbits: {
      binary: { a: 0.2, e: 0, inc: 0, Omega: 0, omega: 0, period: 10, t0: 0 },
      hierarchy: [],
    },
    photometry: {
      baselineFlux: 1,
      gridRes: 240,
      limbDarkeningModel: {
        bandpass: band,
        bands: {
          g: { kind: "quadratic", u1: 0.33, u2: 0.19 },
          r: { kind: "quadratic", u1: 0.33, u2: 0.19 },
        },
      },
    },
  };
}

async function withBinarySimulationConfig<T>(
  config: SimulationConfigV4,
  run: (args: { baseline: number; fluxAt: (tSec: number) => number }) => T,
): Promise<T> {
  const sim = createSimulationV4(config);
  await sim.prepare();
  const baseline = binaryFluxDisplayBaseline(config) ?? 1;
  try {
    return run({
      baseline,
      fluxAt: (tSec: number) => scaleFluxForDisplay(sim.step(tSec).flux.total, baseline),
    });
  } finally {
    // No dispose surface; keep helper shape symmetric with other runtime tests.
  }
}

function scientificBrowserBinaryConfig(config: SimulationConfigV4): SimulationConfigV4 {
  return {
    ...structuredClone(config),
    runtime: {
      ...(config.runtime ?? {}),
      executionMode: "scientific-browser",
    },
    dynamics: {
      ...(config.dynamics ?? {}),
      relativity: {
        enabled: false,
        ltte: false,
        shapiro: false,
        grPrecession: false,
      },
    },
  };
}

function withUniformDiskExplicitLaw(config: SimulationConfigV4, band: "g" | "r"): SimulationConfigV4 {
  return {
    ...structuredClone(config),
    photometry: {
      ...(config.photometry ?? {}),
      gridRes: Math.max(360, config.photometry?.gridRes ?? 0),
      limbDarkeningModel: {
        bandpass: band,
        bands: {
          [band]: { kind: "quadratic", u1: 0, u2: 0 },
        },
      },
    },
  };
}

async function stepBinaryConfig(config: SimulationConfigV4, tSec = 0): Promise<SimulationStepV3> {
  const sim = createSimulationV4(config);
  await sim.prepare();
  return sim.step(tSec);
}

function analyticUniformBinaryDisplayFlux(args: {
  config: SimulationConfigV4;
  step: SimulationStepV3;
}): number {
  const { config, step } = args;
  const [starA, starB] = config.bodies.stars;
  const baseline = binaryFluxDisplayBaseline(config);
  if (!starA || !starB || !(baseline && baseline > 0)) {
    throw new Error("analytic detached-binary reference requires two stars and a finite baseline");
  }

  const resolved = resolveDetachedBinaryLuminosities({
    primary: starA,
    secondary: starB,
    fallbackPassband: undefined,
    secondaryFallbackLuminosityScale: 0,
  });
  if (resolved.source !== "physical-bandpass") {
    throw new Error("analytic detached-binary reference requires physical bandpass luminosities");
  }

  const relativeSky = step.renderSignals.orbitFrames.planetSky;
  const separation = Math.hypot(relativeSky.x, relativeSky.y);
  const overlap = circleIntersectionArea(separation, starA.r, starB.r);
  const areaA = Math.PI * starA.r * starA.r;
  const areaB = Math.PI * starB.r * starB.r;
  const intensityA = resolved.primary / areaA;
  const intensityB = resolved.secondary / areaB;

  let totalFlux = resolved.primary + resolved.secondary;
  if (relativeSky.z > 0) {
    totalFlux -= intensityA * overlap;
  } else if (relativeSky.z < 0) {
    totalFlux -= intensityB * overlap;
  }

  return scaleFluxForDisplay(totalFlux, baseline);
}

function minFluxNear(args: {
  fluxAt: (tSec: number) => number;
  centerSec: number;
  halfWindowSec: number;
  samples: number;
}): number {
  const { fluxAt, centerSec, halfWindowSec, samples } = args;
  let minFlux = Number.POSITIVE_INFINITY;
  for (let i = 0; i < samples; i += 1) {
    const alpha = samples === 1 ? 0.5 : i / (samples - 1);
    const tSec = centerSec - halfWindowSec + 2 * halfWindowSec * alpha;
    minFlux = Math.min(minFlux, fluxAt(tSec));
  }
  return minFlux;
}

function minFluxTimeNear(args: {
  fluxAt: (tSec: number) => number;
  centerSec: number;
  halfWindowSec: number;
  samples: number;
}): number {
  const { fluxAt, centerSec, halfWindowSec, samples } = args;
  let minFlux = Number.POSITIVE_INFINITY;
  let minTimeSec = centerSec;
  for (let i = 0; i < samples; i += 1) {
    const alpha = samples === 1 ? 0.5 : i / (samples - 1);
    const tSec = centerSec - halfWindowSec + 2 * halfWindowSec * alpha;
    const flux = fluxAt(tSec);
    if (flux < minFlux) {
      minFlux = flux;
      minTimeSec = tSec;
    }
  }
  return minTimeSec;
}

describe("literature benchmark smoke detached-binary photometry", () => {
  it("keeps detached binary eclipse depth finite and periodic", async () => {
    await withBinaryLabSimulation(({ fluxAt }) => {
      const period = DEFAULT_BINARY_LAB_CONFIG_V4.orbits.binary.period;
      const d0 = 1 - fluxAt(0);
      const d1 = 1 - fluxAt(period);
      const dHalf = 1 - fluxAt(period / 2);

      expect(Number.isFinite(d0)).toBe(true);
      expect(Number.isFinite(d1)).toBe(true);
      expect(Number.isFinite(dHalf)).toBe(true);
      expect(Math.abs(d0 - d1)).toBeLessThan(0.05);
    });
  });

  it("starts the default binary lab close enough to eclipse to show early flux evolution", async () => {
    await withBinaryLabSimulation(({ fluxAt }) => {
      const samples = Array.from({ length: 12 }, (_, i) => fluxAt(i * 800));

      expect(samples.every(Number.isFinite)).toBe(true);
      expect(samples.some((flux) => Math.abs(flux - samples[0]) > 1e-6)).toBe(true);
    });
  });

  it("keeps a detached-binary uniform-disk primary eclipse on an analytic overlap reference", async () => {
    const config = withUniformDiskExplicitLaw(
      scientificBrowserBinaryConfig(buildUnequalBinaryBenchmarkConfig("g")),
      "g",
    );
    const step = await stepBinaryConfig(config, 0);
    const actual =
      step.debug?.displayFluxValue ??
      scaleFluxForDisplay(step.flux.total, binaryFluxDisplayBaseline(config) ?? 1);
    const expected = analyticUniformBinaryDisplayFlux({ config, step });

    expect(Math.abs(actual - expected)).toBeLessThanOrEqual(5e-3);
  }, 20_000);

  it("keeps a symmetric detached-binary uniform-disk eclipse on an analytic overlap reference", async () => {
    const config = withUniformDiskExplicitLaw(
      scientificBrowserBinaryConfig(buildSameSedSymmetricBinaryBenchmarkConfig("g")),
      "g",
    );
    const step = await stepBinaryConfig(config, 0);
    const actual =
      step.debug?.displayFluxValue ??
      scaleFluxForDisplay(step.flux.total, binaryFluxDisplayBaseline(config) ?? 1);
    const expected = analyticUniformBinaryDisplayFlux({ config, step });

    expect(Math.abs(actual - expected)).toBeLessThanOrEqual(5e-3);
  }, 20_000);

  it("keeps the primary eclipse deeper than the secondary eclipse for an unequal detached binary", async () => {
    const config = buildUnequalBinaryBenchmarkConfig("g");
    await withBinarySimulationConfig(config, ({ fluxAt }) => {
      const period = config.orbits.binary.period;
      const primaryMin = minFluxNear({
        fluxAt,
        centerSec: 0,
        halfWindowSec: period * 0.08,
        samples: 81,
      });
      const secondaryMin = minFluxNear({
        fluxAt,
        centerSec: period / 2,
        halfWindowSec: period * 0.08,
        samples: 81,
      });
      const primaryDepth = 1 - primaryMin;
      const secondaryDepth = 1 - secondaryMin;

      expect(primaryDepth).toBeGreaterThan(secondaryDepth);
      expect(primaryDepth).toBeGreaterThan(0);
      expect(secondaryDepth).toBeGreaterThan(0);
    });
  }, 20_000);

  it("changes the secondary eclipse depth across passbands for unequal stars", async () => {
    const configG = buildUnequalBinaryBenchmarkConfig("g");
    const configR = buildUnequalBinaryBenchmarkConfig("r");

    await withBinarySimulationConfig(configG, ({ fluxAt: fluxAtG }) =>
      withBinarySimulationConfig(configR, ({ fluxAt: fluxAtR }) => {
        const period = configG.orbits.binary.period;
        const secondaryDepthG =
          1 -
          minFluxNear({
            fluxAt: fluxAtG,
            centerSec: period / 2,
            halfWindowSec: period * 0.08,
            samples: 81,
          });
        const secondaryDepthR =
          1 -
          minFluxNear({
            fluxAt: fluxAtR,
            centerSec: period / 2,
            halfWindowSec: period * 0.08,
            samples: 81,
          });

        expect(secondaryDepthR).toBeGreaterThan(secondaryDepthG);
      }),
    );
  }, 20_000);

  it("keeps the primary eclipse shallower in redder passbands for an unequal detached binary", async () => {
    const configG = buildUnequalBinaryBenchmarkConfig("g");
    const configR = buildUnequalBinaryBenchmarkConfig("r");

    await withBinarySimulationConfig(configG, ({ fluxAt: fluxAtG }) =>
      withBinarySimulationConfig(configR, ({ fluxAt: fluxAtR }) => {
        const period = configG.orbits.binary.period;
        const primaryDepthG =
          1 -
          minFluxNear({
            fluxAt: fluxAtG,
            centerSec: 0,
            halfWindowSec: period * 0.08,
            samples: 81,
          });
        const primaryDepthR =
          1 -
          minFluxNear({
            fluxAt: fluxAtR,
            centerSec: 0,
            halfWindowSec: period * 0.08,
            samples: 81,
          });

        expect(primaryDepthG).toBeGreaterThan(primaryDepthR);
      }),
    );
  }, 20_000);

  it("keeps symmetric detached-binary eclipse depths passband-neutral", async () => {
    const configG = buildSymmetricBinaryBenchmarkConfig("g");
    const configR = buildSymmetricBinaryBenchmarkConfig("r");

    await withBinarySimulationConfig(configG, ({ fluxAt: fluxAtG }) =>
      withBinarySimulationConfig(configR, ({ fluxAt: fluxAtR }) => {
        const period = configG.orbits.binary.period;
        const primaryDepthG =
          1 -
          minFluxNear({
            fluxAt: fluxAtG,
            centerSec: 0,
            halfWindowSec: period * 0.08,
            samples: 81,
          });
        const secondaryDepthG =
          1 -
          minFluxNear({
            fluxAt: fluxAtG,
            centerSec: period / 2,
            halfWindowSec: period * 0.08,
            samples: 81,
          });
        const primaryDepthR =
          1 -
          minFluxNear({
            fluxAt: fluxAtR,
            centerSec: 0,
            halfWindowSec: period * 0.08,
            samples: 81,
          });
        const secondaryDepthR =
          1 -
          minFluxNear({
            fluxAt: fluxAtR,
            centerSec: period / 2,
            halfWindowSec: period * 0.08,
            samples: 81,
          });

        expect(primaryDepthG).toBeCloseTo(secondaryDepthG, 6);
        expect(primaryDepthR).toBeCloseTo(secondaryDepthR, 6);
        expect(primaryDepthG).toBeCloseTo(primaryDepthR, 6);
        expect(secondaryDepthG).toBeCloseTo(secondaryDepthR, 6);
      }),
    );
  }, 20_000);

  it("keeps the symmetric detached-binary eclipse shape far more passband-neutral than the unequal-star case", async () => {
    const symmetricG = buildSymmetricBinaryBenchmarkConfig("g");
    const symmetricR = buildSymmetricBinaryBenchmarkConfig("r");
    const unequalG = buildUnequalBinaryBenchmarkConfig("g");
    const unequalR = buildUnequalBinaryBenchmarkConfig("r");

    await withBinarySimulationConfig(symmetricG, ({ fluxAt: symmetricFluxAtG }) =>
      withBinarySimulationConfig(symmetricR, ({ fluxAt: symmetricFluxAtR }) =>
        withBinarySimulationConfig(unequalG, ({ fluxAt: unequalFluxAtG }) =>
          withBinarySimulationConfig(unequalR, ({ fluxAt: unequalFluxAtR }) => {
            const period = symmetricG.orbits.binary.period;
            const sampleTimes = [-0.6, -0.3, 0, 0.3, 0.6, period / 2 - 0.6, period / 2, period / 2 + 0.6];

            const symmetricMaxDelta = Math.max(
              ...sampleTimes.map((tSec) => Math.abs(symmetricFluxAtG(tSec) - symmetricFluxAtR(tSec))),
            );
            const unequalMaxDelta = Math.max(
              ...sampleTimes.map((tSec) => Math.abs(unequalFluxAtG(tSec) - unequalFluxAtR(tSec))),
            );

            expect(symmetricMaxDelta).toBeLessThan(unequalMaxDelta);
          }),
        ),
      ),
    );
  }, 20_000);

  it("raises the combined detached-binary baseline in redder passbands when the secondary is redder", () => {
    const baselineG = binaryFluxDisplayBaseline(buildUnequalBinaryBenchmarkConfig("g"));
    const baselineR = binaryFluxDisplayBaseline(buildUnequalBinaryBenchmarkConfig("r"));

    expect(baselineG).toBeDefined();
    expect(baselineR).toBeDefined();
    expect(baselineR ?? 0).toBeGreaterThan(baselineG ?? Number.POSITIVE_INFINITY);
  });

  it("inverts the detached-binary passband trend when the secondary star is hotter", async () => {
    const configG = buildBlueSecondaryBinaryBenchmarkConfig("g");
    const configR = buildBlueSecondaryBinaryBenchmarkConfig("r");

    await withBinarySimulationConfig(configG, ({ fluxAt: fluxAtG }) =>
      withBinarySimulationConfig(configR, ({ fluxAt: fluxAtR }) => {
        const period = configG.orbits.binary.period;
        const primaryDepthG =
          1 -
          minFluxNear({
            fluxAt: fluxAtG,
            centerSec: 0,
            halfWindowSec: period * 0.08,
            samples: 81,
          });
        const primaryDepthR =
          1 -
          minFluxNear({
            fluxAt: fluxAtR,
            centerSec: 0,
            halfWindowSec: period * 0.08,
            samples: 81,
          });
        const secondaryDepthG =
          1 -
          minFluxNear({
            fluxAt: fluxAtG,
            centerSec: period / 2,
            halfWindowSec: period * 0.08,
            samples: 81,
          });
        const secondaryDepthR =
          1 -
          minFluxNear({
            fluxAt: fluxAtR,
            centerSec: period / 2,
            halfWindowSec: period * 0.08,
            samples: 81,
          });

        expect(secondaryDepthG).toBeGreaterThan(secondaryDepthR);
        expect(primaryDepthR).toBeGreaterThan(primaryDepthG);
      }),
    );
  }, 20_000);

  it("raises the combined detached-binary baseline in bluer passbands when the secondary is hotter", () => {
    const baselineG = binaryFluxDisplayBaseline(buildBlueSecondaryBinaryBenchmarkConfig("g"));
    const baselineR = binaryFluxDisplayBaseline(buildBlueSecondaryBinaryBenchmarkConfig("r"));

    expect(baselineG).toBeDefined();
    expect(baselineR).toBeDefined();
    expect(baselineG ?? 0).toBeGreaterThan(baselineR ?? Number.POSITIVE_INFINITY);
  });

  it("keeps same-SED unequal detached-binary passband trends weaker than real spectral-contrast cases", async () => {
    const sameSedG = buildSameSedUnequalBinaryBenchmarkConfig("g");
    const sameSedR = buildSameSedUnequalBinaryBenchmarkConfig("r");
    const redSecondaryG = buildUnequalBinaryBenchmarkConfig("g");
    const redSecondaryR = buildUnequalBinaryBenchmarkConfig("r");
    const blueSecondaryG = buildBlueSecondaryBinaryBenchmarkConfig("g");
    const blueSecondaryR = buildBlueSecondaryBinaryBenchmarkConfig("r");

    await withBinarySimulationConfig(sameSedG, ({ fluxAt: sameSedFluxAtG }) =>
      withBinarySimulationConfig(sameSedR, ({ fluxAt: sameSedFluxAtR }) =>
        withBinarySimulationConfig(redSecondaryG, ({ fluxAt: redSecondaryFluxAtG }) =>
          withBinarySimulationConfig(redSecondaryR, ({ fluxAt: redSecondaryFluxAtR }) =>
            withBinarySimulationConfig(blueSecondaryG, ({ fluxAt: blueSecondaryFluxAtG }) =>
              withBinarySimulationConfig(blueSecondaryR, ({ fluxAt: blueSecondaryFluxAtR }) => {
                const period = sameSedG.orbits.binary.period;
                const primaryDepthSameSedG =
                  1 -
                  minFluxNear({
                    fluxAt: sameSedFluxAtG,
                    centerSec: 0,
                    halfWindowSec: period * 0.08,
                    samples: 81,
                  });
                const primaryDepthSameSedR =
                  1 -
                  minFluxNear({
                    fluxAt: sameSedFluxAtR,
                    centerSec: 0,
                    halfWindowSec: period * 0.08,
                    samples: 81,
                  });
                const secondaryDepthSameSedG =
                  1 -
                  minFluxNear({
                    fluxAt: sameSedFluxAtG,
                    centerSec: period / 2,
                    halfWindowSec: period * 0.08,
                    samples: 81,
                  });
                const secondaryDepthSameSedR =
                  1 -
                  minFluxNear({
                    fluxAt: sameSedFluxAtR,
                    centerSec: period / 2,
                    halfWindowSec: period * 0.08,
                    samples: 81,
                  });
                const primaryDepthRedSecondaryG =
                  1 -
                  minFluxNear({
                    fluxAt: redSecondaryFluxAtG,
                    centerSec: 0,
                    halfWindowSec: period * 0.08,
                    samples: 81,
                  });
                const primaryDepthRedSecondaryR =
                  1 -
                  minFluxNear({
                    fluxAt: redSecondaryFluxAtR,
                    centerSec: 0,
                    halfWindowSec: period * 0.08,
                    samples: 81,
                  });
                const secondaryDepthRedSecondaryG =
                  1 -
                  minFluxNear({
                    fluxAt: redSecondaryFluxAtG,
                    centerSec: period / 2,
                    halfWindowSec: period * 0.08,
                    samples: 81,
                  });
                const secondaryDepthRedSecondaryR =
                  1 -
                  minFluxNear({
                    fluxAt: redSecondaryFluxAtR,
                    centerSec: period / 2,
                    halfWindowSec: period * 0.08,
                    samples: 81,
                  });
                const primaryDepthBlueSecondaryG =
                  1 -
                  minFluxNear({
                    fluxAt: blueSecondaryFluxAtG,
                    centerSec: 0,
                    halfWindowSec: period * 0.08,
                    samples: 81,
                  });
                const primaryDepthBlueSecondaryR =
                  1 -
                  minFluxNear({
                    fluxAt: blueSecondaryFluxAtR,
                    centerSec: 0,
                    halfWindowSec: period * 0.08,
                    samples: 81,
                  });
                const secondaryDepthBlueSecondaryG =
                  1 -
                  minFluxNear({
                    fluxAt: blueSecondaryFluxAtG,
                    centerSec: period / 2,
                    halfWindowSec: period * 0.08,
                    samples: 81,
                  });
                const secondaryDepthBlueSecondaryR =
                  1 -
                  minFluxNear({
                    fluxAt: blueSecondaryFluxAtR,
                    centerSec: period / 2,
                    halfWindowSec: period * 0.08,
                    samples: 81,
                  });

                const primaryDeltaSameSed = Math.abs(primaryDepthSameSedG - primaryDepthSameSedR);
                const secondaryDeltaSameSed = Math.abs(secondaryDepthSameSedG - secondaryDepthSameSedR);
                const primaryDeltaRedSecondary = Math.abs(
                  primaryDepthRedSecondaryG - primaryDepthRedSecondaryR,
                );
                const secondaryDeltaRedSecondary = Math.abs(
                  secondaryDepthRedSecondaryG - secondaryDepthRedSecondaryR,
                );
                const primaryDeltaBlueSecondary = Math.abs(
                  primaryDepthBlueSecondaryG - primaryDepthBlueSecondaryR,
                );
                const secondaryDeltaBlueSecondary = Math.abs(
                  secondaryDepthBlueSecondaryG - secondaryDepthBlueSecondaryR,
                );

                expect(primaryDeltaSameSed).toBeLessThan(primaryDeltaRedSecondary);
                expect(primaryDeltaSameSed).toBeLessThan(primaryDeltaBlueSecondary);
                expect(secondaryDeltaSameSed).toBeLessThan(secondaryDeltaRedSecondary);
                expect(secondaryDeltaSameSed).toBeLessThan(secondaryDeltaBlueSecondary);
              }),
            ),
          ),
        ),
      ),
    );
  }, 20_000);

  it("keeps same-SED unequal detached-binary eclipse depths passband-neutral under explicit equal band laws", async () => {
    const configG = buildSameSedUnequalExplicitLawBinaryBenchmarkConfig("g");
    const configR = buildSameSedUnequalExplicitLawBinaryBenchmarkConfig("r");

    await withBinarySimulationConfig(configG, ({ fluxAt: fluxAtG }) =>
      withBinarySimulationConfig(configR, ({ fluxAt: fluxAtR }) => {
        const period = configG.orbits.binary.period;
        const primaryDepthG =
          1 -
          minFluxNear({
            fluxAt: fluxAtG,
            centerSec: 0,
            halfWindowSec: period * 0.08,
            samples: 81,
          });
        const primaryDepthR =
          1 -
          minFluxNear({
            fluxAt: fluxAtR,
            centerSec: 0,
            halfWindowSec: period * 0.08,
            samples: 81,
          });
        const secondaryDepthG =
          1 -
          minFluxNear({
            fluxAt: fluxAtG,
            centerSec: period / 2,
            halfWindowSec: period * 0.08,
            samples: 81,
          });
        const secondaryDepthR =
          1 -
          minFluxNear({
            fluxAt: fluxAtR,
            centerSec: period / 2,
            halfWindowSec: period * 0.08,
            samples: 81,
          });

        expect(primaryDepthG).toBeCloseTo(primaryDepthR, 6);
        expect(secondaryDepthG).toBeCloseTo(secondaryDepthR, 6);
      }),
    );
  }, 20_000);

  it("keeps the same-SED explicit-law eclipse shape far more passband-neutral than the unequal-star case", async () => {
    const sameSedG = buildSameSedUnequalExplicitLawBinaryBenchmarkConfig("g");
    const sameSedR = buildSameSedUnequalExplicitLawBinaryBenchmarkConfig("r");
    const unequalG = buildUnequalBinaryBenchmarkConfig("g");
    const unequalR = buildUnequalBinaryBenchmarkConfig("r");

    await withBinarySimulationConfig(sameSedG, ({ fluxAt: sameSedFluxAtG }) =>
      withBinarySimulationConfig(sameSedR, ({ fluxAt: sameSedFluxAtR }) =>
        withBinarySimulationConfig(unequalG, ({ fluxAt: unequalFluxAtG }) =>
          withBinarySimulationConfig(unequalR, ({ fluxAt: unequalFluxAtR }) => {
            const period = sameSedG.orbits.binary.period;
            const sampleTimes = [-0.6, -0.3, 0, 0.3, 0.6, period / 2 - 0.6, period / 2, period / 2 + 0.6];

            const sameSedMaxDelta = Math.max(
              ...sampleTimes.map((tSec) => Math.abs(sameSedFluxAtG(tSec) - sameSedFluxAtR(tSec))),
            );
            const unequalMaxDelta = Math.max(
              ...sampleTimes.map((tSec) => Math.abs(unequalFluxAtG(tSec) - unequalFluxAtR(tSec))),
            );

            expect(sameSedMaxDelta).toBeLessThan(unequalMaxDelta);
          }),
        ),
      ),
    );
  }, 20_000);

  it("keeps the same-Sed detached-binary baseline g/r ratio invariant under size asymmetry", () => {
    const unequalBaselineG = binaryFluxDisplayBaseline(
      buildSameSedUnequalExplicitLawBinaryBenchmarkConfig("g"),
    );
    const unequalBaselineR = binaryFluxDisplayBaseline(
      buildSameSedUnequalExplicitLawBinaryBenchmarkConfig("r"),
    );
    const symmetricBaselineG = binaryFluxDisplayBaseline(buildSameSedSymmetricBinaryBenchmarkConfig("g"));
    const symmetricBaselineR = binaryFluxDisplayBaseline(buildSameSedSymmetricBinaryBenchmarkConfig("r"));

    expect(unequalBaselineG).toBeDefined();
    expect(unequalBaselineR).toBeDefined();
    expect(symmetricBaselineG).toBeDefined();
    expect(symmetricBaselineR).toBeDefined();

    const unequalRatio = (unequalBaselineG ?? 0) / (unequalBaselineR ?? 1);
    const symmetricRatio = (symmetricBaselineG ?? 0) / (symmetricBaselineR ?? 1);

    expect(unequalRatio).toBeCloseTo(symmetricRatio, 12);
  });

  it("keeps detached-binary eclipse timing offsets passband-invariant for an unequal binary", async () => {
    const configG = buildUnequalBinaryBenchmarkConfig("g");
    const configR = buildUnequalBinaryBenchmarkConfig("r");

    await withBinarySimulationConfig(configG, ({ fluxAt: fluxAtG }) =>
      withBinarySimulationConfig(configR, ({ fluxAt: fluxAtR }) => {
        const period = configG.orbits.binary.period;
        const primaryMinTimeG = minFluxTimeNear({
          fluxAt: fluxAtG,
          centerSec: 0,
          halfWindowSec: period * 0.08,
          samples: 401,
        });
        const primaryMinTimeR = minFluxTimeNear({
          fluxAt: fluxAtR,
          centerSec: 0,
          halfWindowSec: period * 0.08,
          samples: 401,
        });
        const secondaryMinTimeG = minFluxTimeNear({
          fluxAt: fluxAtG,
          centerSec: period / 2,
          halfWindowSec: period * 0.08,
          samples: 401,
        });
        const secondaryMinTimeR = minFluxTimeNear({
          fluxAt: fluxAtR,
          centerSec: period / 2,
          halfWindowSec: period * 0.08,
          samples: 401,
        });

        expect(Math.abs(primaryMinTimeG)).toBeCloseTo(Math.abs(primaryMinTimeR), 12);
        expect(Math.abs(secondaryMinTimeG - period / 2)).toBeCloseTo(
          Math.abs(secondaryMinTimeR - period / 2),
          12,
        );
      }),
    );
  }, 20_000);

  it("keeps detached-binary eclipse timing offsets passband-invariant when the secondary is hotter", async () => {
    const configG = buildBlueSecondaryBinaryBenchmarkConfig("g");
    const configR = buildBlueSecondaryBinaryBenchmarkConfig("r");

    await withBinarySimulationConfig(configG, ({ fluxAt: fluxAtG }) =>
      withBinarySimulationConfig(configR, ({ fluxAt: fluxAtR }) => {
        const period = configG.orbits.binary.period;
        const primaryMinTimeG = minFluxTimeNear({
          fluxAt: fluxAtG,
          centerSec: 0,
          halfWindowSec: period * 0.08,
          samples: 401,
        });
        const primaryMinTimeR = minFluxTimeNear({
          fluxAt: fluxAtR,
          centerSec: 0,
          halfWindowSec: period * 0.08,
          samples: 401,
        });
        const secondaryMinTimeG = minFluxTimeNear({
          fluxAt: fluxAtG,
          centerSec: period / 2,
          halfWindowSec: period * 0.08,
          samples: 401,
        });
        const secondaryMinTimeR = minFluxTimeNear({
          fluxAt: fluxAtR,
          centerSec: period / 2,
          halfWindowSec: period * 0.08,
          samples: 401,
        });

        expect(Math.abs(primaryMinTimeG)).toBeCloseTo(Math.abs(primaryMinTimeR), 12);
        expect(Math.abs(secondaryMinTimeG - period / 2)).toBeCloseTo(
          Math.abs(secondaryMinTimeR - period / 2),
          12,
        );
      }),
    );
  }, 20_000);

  it("keeps same-SED detached-binary timing offsets passband-neutral under explicit equal band laws", async () => {
    const configG = buildSameSedUnequalExplicitLawBinaryBenchmarkConfig("g");
    const configR = buildSameSedUnequalExplicitLawBinaryBenchmarkConfig("r");

    await withBinarySimulationConfig(configG, ({ fluxAt: fluxAtG }) =>
      withBinarySimulationConfig(configR, ({ fluxAt: fluxAtR }) => {
        const period = configG.orbits.binary.period;
        const primaryMinTimeG = minFluxTimeNear({
          fluxAt: fluxAtG,
          centerSec: 0,
          halfWindowSec: period * 0.08,
          samples: 401,
        });
        const primaryMinTimeR = minFluxTimeNear({
          fluxAt: fluxAtR,
          centerSec: 0,
          halfWindowSec: period * 0.08,
          samples: 401,
        });
        const secondaryMinTimeG = minFluxTimeNear({
          fluxAt: fluxAtG,
          centerSec: period / 2,
          halfWindowSec: period * 0.08,
          samples: 401,
        });
        const secondaryMinTimeR = minFluxTimeNear({
          fluxAt: fluxAtR,
          centerSec: period / 2,
          halfWindowSec: period * 0.08,
          samples: 401,
        });

        expect(Math.abs(primaryMinTimeG)).toBeCloseTo(Math.abs(primaryMinTimeR), 12);
        expect(Math.abs(secondaryMinTimeG - period / 2)).toBeCloseTo(
          Math.abs(secondaryMinTimeR - period / 2),
          12,
        );
      }),
    );
  }, 20_000);

  it("keeps symmetric detached-binary timing offsets passband-neutral", async () => {
    const configG = buildSymmetricBinaryBenchmarkConfig("g");
    const configR = buildSymmetricBinaryBenchmarkConfig("r");

    await withBinarySimulationConfig(configG, ({ fluxAt: fluxAtG }) =>
      withBinarySimulationConfig(configR, ({ fluxAt: fluxAtR }) => {
        const period = configG.orbits.binary.period;
        const primaryMinTimeG = minFluxTimeNear({
          fluxAt: fluxAtG,
          centerSec: 0,
          halfWindowSec: period * 0.08,
          samples: 401,
        });
        const primaryMinTimeR = minFluxTimeNear({
          fluxAt: fluxAtR,
          centerSec: 0,
          halfWindowSec: period * 0.08,
          samples: 401,
        });
        const secondaryMinTimeG = minFluxTimeNear({
          fluxAt: fluxAtG,
          centerSec: period / 2,
          halfWindowSec: period * 0.08,
          samples: 401,
        });
        const secondaryMinTimeR = minFluxTimeNear({
          fluxAt: fluxAtR,
          centerSec: period / 2,
          halfWindowSec: period * 0.08,
          samples: 401,
        });

        expect(Math.abs(primaryMinTimeG)).toBeCloseTo(Math.abs(primaryMinTimeR), 12);
        expect(Math.abs(secondaryMinTimeG - period / 2)).toBeCloseTo(
          Math.abs(secondaryMinTimeR - period / 2),
          12,
        );
      }),
    );
  }, 20_000);
});
