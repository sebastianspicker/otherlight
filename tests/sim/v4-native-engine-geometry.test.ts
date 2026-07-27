/** Verifies v4 native engine geometry contracts across system state, transit observables, and V4 integration. */

import { afterEach, describe, expect, it } from "vitest";

import { cloneParams, SCENARIO_DEFAULTS } from "../../src/app/scenario";
import { DEFAULT_BINARY_LAB_CONFIG_V4 } from "../../src/app/binaryLab";
import {
  captureDidacticsHookState,
  restoreDidacticsHookState,
  setDidacticsHook,
} from "../../src/sim/didacticsHook";
import { normalizeScenarioInputToV4 } from "../../src/sim/v4/migrate";
import { buildNativeSnapshot } from "../../src/sim/v4/nativeModel";
import { stepNativeSimulationV4 } from "../../src/sim/v4/nativeEngine";
import type { SimulationConfigV4 } from "../../src/sim/v4/types";
import type { StepResult, SystemParams } from "../../src/core/types";

const didacticsSnapshot = captureDidacticsHookState();

afterEach(() => {
  restoreDidacticsHookState(didacticsSnapshot);
});

function makeConfig(): SimulationConfigV4 {
  const params = cloneParams(SCENARIO_DEFAULTS);
  params.didactics = { enabled: true };
  return normalizeScenarioInputToV4(params) as SimulationConfigV4;
}

function findFrontTransitTime(config: SimulationConfigV4): number {
  const period = config.bodies.planets[0]?.orbit.period ?? 1;
  for (let i = 0; i < 32; i++) {
    const tObsSec = (period * i) / 32;
    const snap = buildNativeSnapshot(config, tObsSec);
    const planet = snap.planets[0];
    if (planet && planet.sky.z > 0 && Math.abs(planet.sky.x) > 1e-6) return tObsSec;
  }
  throw new Error("expected a front-of-star sample with non-zero projected x");
}

describe("v4 native engine transit geometry", () => {
  it("passes authentic projected geometry into the didactics hook", () => {
    const config = makeConfig();
    const tObsSec = findFrontTransitTime(config);
    let capturedSystem: SystemParams | undefined;
    let capturedStep: StepResult | undefined;
    setDidacticsHook((system, step) => {
      capturedSystem = system;
      capturedStep = step;
      return undefined;
    });

    const out = stepNativeSimulationV4({ config, tObsSec, mode: "realtime" });

    expect(capturedSystem?.didactics?.enabled).toBe(true);
    expect(capturedStep?.planetSky).toEqual(out.step.renderSignals.orbitFrames.planetSky);
    expect(capturedStep?.moonSky).toEqual(out.step.renderSignals.orbitFrames.moonSky);
    expect(capturedStep?.meta?.bPlanet).toBe(out.step.debug?.bPlanet);
    expect(capturedStep?.meta?.bMoon).toBe(out.step.debug?.bMoon);
  });

  it("uses full projected separation for the V4 impact parameter", () => {
    const config = makeConfig();
    const tObsSec = findFrontTransitTime(config);

    const out = stepNativeSimulationV4({ config, tObsSec, mode: "realtime" });
    const sky = out.step.renderSignals.orbitFrames.planetSky;
    const expected = Math.hypot(sky.x, sky.y) / config.bodies.stars[0].r;

    expect(out.step.debug?.bPlanet).toBeCloseTo(expected, 12);
  });

  it("keeps didactics active for detached binary lessons without a planet body", () => {
    const config = structuredClone(DEFAULT_BINARY_LAB_CONFIG_V4);
    let capturedStep: StepResult | undefined;
    setDidacticsHook((_system, step) => {
      capturedStep = step;
      return undefined;
    });

    const out = stepNativeSimulationV4({ config, tObsSec: 0, mode: "realtime" });

    expect(out.step.didactics?.signals).toBeUndefined();
    expect(capturedStep?.meta?.baselineFluxUsed).toBeGreaterThan(1);
    expect(capturedStep?.meta?.bPlanet).toBeTypeOf("number");
    expect(capturedStep?.planetSky).toEqual(out.step.renderSignals.orbitFrames.planetSky);
  });
});
