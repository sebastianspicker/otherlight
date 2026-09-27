/** Replays the checked-in Education V4 parity fixture against the Browser runtime. */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { createSimulationV4, type EducationScenarioV4 } from "../../src/domain/simulation/v4";

type ParityStep = Record<string, unknown> & { timeSec: number };
type ParityFixture = {
  comparisonPolicy: { floating: { absolute: number; relative: number } };
  scenarios: {
    id: string;
    sampleTimesSec: number[];
    scenario: EducationScenarioV4;
    expectedSteps: ParityStep[];
  }[];
};

const fixture = JSON.parse(
  readFileSync(
    path.resolve(import.meta.dirname, "../../../../contracts/education-v4/fixtures/scoped-parity.json"),
    "utf8",
  ),
) as ParityFixture;
const { absolute, relative } = fixture.comparisonPolicy.floating;

/** Mirrors the step projection in scripts/export-native-parity-fixtures.mjs. */
function projectStep(step: ReturnType<ReturnType<typeof createSimulationV4>["step"]>): ParityStep {
  const timing = Object.fromEntries(
    Object.entries(step.timing ?? {}).filter(([, value]) => Number.isFinite(value)),
  );
  return JSON.parse(
    JSON.stringify({
      timeSec: step.tObsSec,
      kinematics: { planetSky: step.kinematics.planetSky, moonSky: step.kinematics.moonSky },
      flux: {
        total: step.flux.total,
        transitFactor: step.flux.transitFactor,
        stellarPreTransit: step.flux.stellarPreTransit,
        planetPhase: step.flux.planetPhase,
        moonPhase: step.flux.moonPhase,
      },
      timing: Object.keys(timing).length ? timing : undefined,
      renderSignals: {
        occulters: step.renderSignals.occulterGeometry,
        events: step.renderSignals.eventMarkers,
      },
      warningFlags: [...step.renderSignals.uncertaintyFlags].sort(),
    }),
  ) as ParityStep;
}

function expectParity(actual: unknown, expected: unknown, at: string): void {
  if (typeof expected === "number") {
    expect(typeof actual, at).toBe("number");
    const tolerance = Math.max(absolute, relative * Math.abs(expected));
    expect(Math.abs((actual as number) - expected), at).toBeLessThanOrEqual(tolerance);
    return;
  }
  if (Array.isArray(expected)) {
    expect(Array.isArray(actual) && actual.length, at).toBe(expected.length);
    expected.forEach((entry, index) => expectParity((actual as unknown[])[index], entry, `${at}[${index}]`));
    return;
  }
  if (expected && typeof expected === "object") {
    expect(Object.keys(actual as object).sort(), at).toEqual(Object.keys(expected).sort());
    for (const [key, entry] of Object.entries(expected)) {
      expectParity((actual as Record<string, unknown>)[key], entry, `${at}.${key}`);
    }
    return;
  }
  expect(actual, at).toEqual(expected);
}

describe("education-v4 scoped parity fixture", () => {
  it.each(fixture.scenarios.map((entry) => [entry.id, entry] as const))("replays %s", (_id, entry) => {
    const runtime = createSimulationV4(structuredClone(entry.scenario));
    entry.sampleTimesSec.forEach((timeSec, index) => {
      expectParity(projectStep(runtime.step(timeSec)), entry.expectedSteps[index], `${entry.id}@${timeSec}`);
    });
  });
});
