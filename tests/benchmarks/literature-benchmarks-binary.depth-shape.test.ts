/** Covers literature benchmarks binary depth shape reference data and literature comparisons for photometry calibration. */

import { expect, it } from "vitest";

import { DEFAULT_BINARY_LAB_CONFIG_V4 } from "../../src/app/binaryLab";
import { binaryFluxDisplayBaseline, scaleFluxForDisplay } from "../../src/app/displayFlux";
import {
  analyticUniformBinaryDisplayFlux,
  buildBlueSecondaryBinaryBenchmarkConfig,
  buildSameSedSymmetricBinaryBenchmarkConfig,
  buildSymmetricBinaryBenchmarkConfig,
  buildUnequalBinaryBenchmarkConfig,
  minFluxNear,
  scientificBrowserBinaryConfig,
  stepBinaryConfig,
  withBinaryLabSimulation,
  withBinarySimulationConfig,
  withUniformDiskExplicitLaw,
} from "./literature-benchmarks-binary.helpers";

// These are numerical correctness benchmarks, not performance gates. V8
// coverage instrumentation can multiply their runtime on shared runners;
// timing regressions belong in tests/perf.
const BINARY_CORRECTNESS_TIMEOUT_MS = 120_000;

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

it(
  "keeps a detached-binary uniform-disk primary eclipse on an analytic overlap reference",
  async () => {
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
  },
  BINARY_CORRECTNESS_TIMEOUT_MS,
);

it(
  "keeps a symmetric detached-binary uniform-disk eclipse on an analytic overlap reference",
  async () => {
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
  },
  BINARY_CORRECTNESS_TIMEOUT_MS,
);

it(
  "keeps the primary eclipse deeper than the secondary eclipse for an unequal detached binary",
  async () => {
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
  },
  BINARY_CORRECTNESS_TIMEOUT_MS,
);

it(
  "changes the secondary eclipse depth across passbands for unequal stars",
  async () => {
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
  },
  BINARY_CORRECTNESS_TIMEOUT_MS,
);

it(
  "keeps the primary eclipse shallower in redder passbands for an unequal detached binary",
  async () => {
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
  },
  BINARY_CORRECTNESS_TIMEOUT_MS,
);

it(
  "keeps symmetric detached-binary eclipse depths passband-neutral",
  async () => {
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
  },
  BINARY_CORRECTNESS_TIMEOUT_MS,
);

it(
  "keeps the symmetric detached-binary eclipse shape far more passband-neutral than the unequal-star case",
  async () => {
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
  },
  BINARY_CORRECTNESS_TIMEOUT_MS,
);

it("raises the combined detached-binary baseline in redder passbands when the secondary is redder", () => {
  const baselineG = binaryFluxDisplayBaseline(buildUnequalBinaryBenchmarkConfig("g"));
  const baselineR = binaryFluxDisplayBaseline(buildUnequalBinaryBenchmarkConfig("r"));

  expect(baselineG).toBeDefined();
  expect(baselineR).toBeDefined();
  expect(baselineR ?? 0).toBeGreaterThan(baselineG ?? Number.POSITIVE_INFINITY);
});

it(
  "inverts the detached-binary passband trend when the secondary star is hotter",
  async () => {
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
  },
  BINARY_CORRECTNESS_TIMEOUT_MS,
);

it("raises the combined detached-binary baseline in bluer passbands when the secondary is hotter", () => {
  const baselineG = binaryFluxDisplayBaseline(buildBlueSecondaryBinaryBenchmarkConfig("g"));
  const baselineR = binaryFluxDisplayBaseline(buildBlueSecondaryBinaryBenchmarkConfig("r"));

  expect(baselineG).toBeDefined();
  expect(baselineR).toBeDefined();
  expect(baselineG ?? 0).toBeGreaterThan(baselineR ?? Number.POSITIVE_INFINITY);
});
