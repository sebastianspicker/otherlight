import { describe, expect, it } from "vitest";

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

describe("literature benchmark smoke detached-binary photometry timing and passband baselines", () => {
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
