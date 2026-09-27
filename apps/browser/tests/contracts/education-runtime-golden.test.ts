/**
 * Characterizes Browser Education output for every preset and bundled real
 * system. The snapshot was captured from the pre-reconstruction runtime; it is
 * regression evidence for the teaching preview, not scientific validation.
 */
import { describe, expect, it } from "vitest";

import { DEFAULT_BINARY_LAB_CONFIG_V4 } from "../../src/application/binaryLab";
import { PRESETS } from "../../src/application/presets";
import { buildParamsFromRealSystem, REAL_SYSTEMS_OPTIONS } from "../../src/application/realSystems";
import { createSimulationRuntimeV4FromParams } from "../../src/application/v4Runtime";
import type { BrowserScenarioDraft } from "../../src/domain/model/types";
import type { RuntimeModeV4 } from "../../src/domain/simulation/v4";

const SAMPLE_FRACTIONS = [0, 0.05, 0.125, 0.25, 0.5, 0.75, 0.95];

const rounded = (value: number): number | string =>
  Number.isFinite(value) ? Number(value.toPrecision(10)) : String(value);

function characterize(system: BrowserScenarioDraft, binaryMode: boolean, runtimeMode: RuntimeModeV4) {
  const runtime = createSimulationRuntimeV4FromParams({
    system,
    binaryMode,
    runtimeMode,
    binaryLabDefaults: DEFAULT_BINARY_LAB_CONFIG_V4.binaryLab,
  });
  try {
    const config = runtime.getConfig();
    const periodSec = config.bodies.planets[0]?.orbit.period ?? config.orbits.binary.period;
    return {
      mode: config.mode,
      statusMessage: runtime.takeStatusMessage() ?? null,
      steps: SAMPLE_FRACTIONS.map((fraction) => {
        const step = runtime.step(fraction * periodSec);
        return {
          fraction,
          fluxTotal: rounded(step.flux.total),
          transitFactor: rounded(step.flux.transitFactor),
          planetSky: [rounded(step.kinematics.planetSky.x), rounded(step.kinematics.planetSky.y)],
          warnings: [...step.renderSignals.uncertaintyFlags].sort(),
        };
      }),
    };
  } finally {
    runtime.dispose();
  }
}

describe("Education runtime characterization", () => {
  it("keeps preset, real-system, and binary-lab output stable", async () => {
    const record: Record<string, unknown> = {};
    for (const preset of PRESETS) {
      record[`preset:${preset.id}`] = characterize(structuredClone(preset.params), false, "realtime");
    }
    for (const option of REAL_SYSTEMS_OPTIONS) {
      record[`real:${option.id}`] = characterize(buildParamsFromRealSystem(option.id), false, "realtime");
    }
    const defaultParams = PRESETS.find((preset) => preset.id === "default")!.params;
    record["binary:default"] = characterize(structuredClone(defaultParams), true, "realtime");
    record["reference:default"] = characterize(structuredClone(defaultParams), false, "reference");
    await expect(`${JSON.stringify(record, null, 1)}\n`).toMatchFileSnapshot(
      "./__snapshots__/education-runtime-golden.json",
    );
  });
});
