/** Covers native parity fixtures data and helpers used by physics baseline regression checks. */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { PRESETS } from "../../src/app/presets";
import type { StepTimingDiagnostics } from "../../src/core/types";
import type { SimulationStepV3 } from "../../src/sim/v3/types";
import { createSimulationV4, migrateSystemParamsToV4 } from "../../src/sim/v4";

const SCOPED_PRESET_IDS = ["default", "kepler-planet-only", "limb-darkening-variation"] as const;
const OUTPUT = path.join(process.cwd(), "contracts/education-v4/fixtures/scoped-parity.json");

function numericTiming(timing: StepTimingDiagnostics | undefined): Record<string, number> | undefined {
  if (!timing) return undefined;
  const entries = Object.entries(timing).filter((entry): entry is [string, number] =>
    Number.isFinite(entry[1]),
  );
  return entries.length ? Object.fromEntries(entries) : undefined;
}

function stepFixture(step: SimulationStepV3) {
  return {
    timeSec: step.tObsSec,
    kinematics: {
      planetSky: step.kinematics.planetSky,
      moonSky: step.kinematics.moonSky,
    },
    flux: {
      total: step.flux.total,
      transitFactor: step.flux.transitFactor,
      stellarPreTransit: step.flux.stellarPreTransit,
      planetPhase: step.flux.planetPhase,
      moonPhase: step.flux.moonPhase,
    },
    timing: numericTiming(step.timing),
    renderSignals: {
      occulters: step.renderSignals.occulterGeometry,
      events: step.renderSignals.eventMarkers,
    },
    warningFlags: [...step.renderSignals.uncertaintyFlags].sort(),
  };
}

function fixtureManifest() {
  const scenarios = SCOPED_PRESET_IDS.map((id) => {
    const preset = PRESETS.find((candidate) => candidate.id === id);
    if (!preset) throw new Error(`Missing scoped preset: ${id}`);
    const scenario = migrateSystemParamsToV4(preset.params);
    scenario.runtime = { mode: "realtime", executionMode: "interactive", referenceSubsteps: 5 };
    const periodSec = scenario.bodies.planets[0]?.orbit.period ?? scenario.orbits.binary.period;
    const sampleTimesSec = [0, periodSec / 8, periodSec / 4, periodSec / 2];
    const runtime = createSimulationV4(scenario);

    return {
      id,
      label: preset.label,
      sampleTimesSec,
      scenario,
      expectedSteps: sampleTimesSec.map((timeSec) => stepFixture(runtime.step(timeSec))),
    };
  });

  return {
    contractVersion: "education-v4/1",
    generator: "scripts/export-native-parity-fixtures.mjs",
    sourceRevision: process.env.NATIVE_PARITY_SOURCE_REVISION || "working-tree",
    comparisonPolicy: {
      exactFields: ["scenario.version", "scenario.mode", "renderSignals.events", "warningFlags"],
      floating: { absolute: 1e-10, relative: 1e-9 },
    },
    scenarios,
  };
}

function expectFiniteNumbers(value: unknown, pathLabel = "manifest"): void {
  if (typeof value === "number") {
    expect(Number.isFinite(value), `${pathLabel} must be finite`).toBe(true);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => expectFiniteNumbers(entry, `${pathLabel}[${index}]`));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      expectFiniteNumbers(entry, `${pathLabel}.${key}`);
    }
  }
}

describe("native Education parity fixture generation", () => {
  it("captures only the approved deterministic V4 surface", () => {
    const manifest = fixtureManifest();
    expect(manifest.scenarios.map((scenario) => scenario.id)).toEqual(SCOPED_PRESET_IDS);
    for (const scenario of manifest.scenarios) {
      expect(scenario.scenario.version).toBe("4");
      expect(scenario.scenario.mode).toBe("general-lab");
      expect(scenario.expectedSteps).toHaveLength(scenario.sampleTimesSec.length);
      expect(scenario.expectedSteps.every((step) => Number.isFinite(step.flux.total))).toBe(true);
    }
    expectFiniteNumbers(manifest);

    if (process.env.NATIVE_PARITY_WRITE === "1") {
      mkdirSync(path.dirname(OUTPUT), { recursive: true });
      writeFileSync(OUTPUT, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    } else {
      const checkedIn = JSON.parse(readFileSync(OUTPUT, "utf8")) as ReturnType<typeof fixtureManifest>;
      expect(checkedIn.contractVersion).toBe(manifest.contractVersion);
      expect(checkedIn.generator).toBe(manifest.generator);
      expect(checkedIn.comparisonPolicy).toEqual(manifest.comparisonPolicy);
      expect(checkedIn.scenarios).toEqual(manifest.scenarios);
    }
  });
});
