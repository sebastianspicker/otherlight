import { expect, it } from "vitest";

import { binaryFluxDisplayBaseline } from "../../src/app/displayFlux";
import {
  buildBlueSecondaryBinaryBenchmarkConfig,
  buildSameSedSymmetricBinaryBenchmarkConfig,
  buildSameSedUnequalBinaryBenchmarkConfig,
  buildSameSedUnequalExplicitLawBinaryBenchmarkConfig,
  buildSymmetricBinaryBenchmarkConfig,
  buildUnequalBinaryBenchmarkConfig,
  minFluxNear,
  minFluxTimeNear,
  withBinarySimulationConfig,
} from "./literature-benchmarks-binary.helpers";

type BinaryDepths = {
  primary: number;
  secondary: number;
};

function binaryDepthsFromFluxAt(fluxAt: (tSec: number) => number, period: number): BinaryDepths {
  return {
    primary:
      1 -
      minFluxNear({
        fluxAt,
        centerSec: 0,
        halfWindowSec: period * 0.08,
        samples: 81,
      }),
    secondary:
      1 -
      minFluxNear({
        fluxAt,
        centerSec: period / 2,
        halfWindowSec: period * 0.08,
        samples: 81,
      }),
  };
}

async function binaryDepthsForConfig(
  config: ReturnType<typeof buildUnequalBinaryBenchmarkConfig>,
): Promise<BinaryDepths> {
  return withBinarySimulationConfig(config, ({ fluxAt }) =>
    binaryDepthsFromFluxAt(fluxAt, config.orbits.binary.period),
  );
}

function depthDelta(g: BinaryDepths, r: BinaryDepths): BinaryDepths {
  return {
    primary: Math.abs(g.primary - r.primary),
    secondary: Math.abs(g.secondary - r.secondary),
  };
}

it("keeps same-SED unequal detached-binary passband trends weaker than real spectral-contrast cases", async () => {
  const sameSedG = buildSameSedUnequalBinaryBenchmarkConfig("g");
  const sameSedR = buildSameSedUnequalBinaryBenchmarkConfig("r");
  const redSecondaryG = buildUnequalBinaryBenchmarkConfig("g");
  const redSecondaryR = buildUnequalBinaryBenchmarkConfig("r");
  const blueSecondaryG = buildBlueSecondaryBinaryBenchmarkConfig("g");
  const blueSecondaryR = buildBlueSecondaryBinaryBenchmarkConfig("r");

  const sameSedDelta = depthDelta(
    await binaryDepthsForConfig(sameSedG),
    await binaryDepthsForConfig(sameSedR),
  );
  const redSecondaryDelta = depthDelta(
    await binaryDepthsForConfig(redSecondaryG),
    await binaryDepthsForConfig(redSecondaryR),
  );
  const blueSecondaryDelta = depthDelta(
    await binaryDepthsForConfig(blueSecondaryG),
    await binaryDepthsForConfig(blueSecondaryR),
  );

  expect(sameSedDelta.primary).toBeLessThan(redSecondaryDelta.primary);
  expect(sameSedDelta.primary).toBeLessThan(blueSecondaryDelta.primary);
  expect(sameSedDelta.secondary).toBeLessThan(redSecondaryDelta.secondary);
  expect(sameSedDelta.secondary).toBeLessThan(blueSecondaryDelta.secondary);
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
}, 60_000);
