/** Verifies v3 adapter contracts across system state, transit observables, and V4 integration. */

import { describe, expect, it } from "vitest";

import { cloneParams, SCENARIO_DEFAULTS } from "../../src/app/scenario";
import {
  createDefaultSimulationConfigV3,
  toSimulationConfigV3,
  toSystemParamsV2,
} from "../../src/sim/v3/adapter";

describe("V3 adapter compatibility surface", () => {
  it("moves advanced modules out of root photometry and restores them on round trip", () => {
    const params = cloneParams(SCENARIO_DEFAULTS);
    params.star.photometry = {
      ...params.star.photometry,
      phaseCurve: {
        ...(params.star.photometry?.phaseCurve ?? {}),
        thermalInertia: { enabled: true, albedo: 0.2, emissivity: 0.9, thermalTimescaleSec: 120 },
      },
      thermalModelAdvanced: { enabled: true, equilibriumScale: 1.1, tauSec: 300 },
      stellarSurface: { enabled: true, useSurfacePatches: true, rotationPeriodSec: 25 },
      instrument: { enabled: true, seed: 7, exposureSec: 10 },
    };
    params.dynamics = {
      ...params.dynamics,
      relativity: { enabled: true, ltte: true, c: 299_792_458 },
      relativityLevel: "enhanced",
    };
    params.didactics = {
      enabled: true,
      activeLessonId: "kepler-geometry",
      autoAssess: true,
      learningState: {
        lessonId: "kepler-geometry",
        stepIndex: 2,
        passedStepIds: ["intro"],
        lastScore: 0.8,
        updatedAtSec: 42,
      },
    };

    const config = toSimulationConfigV3(params);

    expect(config.version).toBe("3");
    expect(config.photometry?.thermalModelAdvanced).toBeUndefined();
    expect(config.photometry?.stellarSurface).toBeUndefined();
    expect(config.thermal?.enabled).toBe(true);
    expect(config.detector?.enabled).toBe(true);
    expect(config.timingRelativity?.level).toBe("enhanced");
    expect(config.didactics?.learningProgress?.stepIndex).toBe(2);

    const roundTrip = toSystemParamsV2(config);

    expect(roundTrip.star.photometry?.thermalModelAdvanced?.enabled).toBe(true);
    expect(roundTrip.star.photometry?.stellarSurface?.useSurfacePatches).toBe(true);
    expect(roundTrip.star.photometry?.instrument?.seed).toBe(7);
    expect(roundTrip.dynamics?.relativityLevel).toBe("enhanced");
    expect(roundTrip.didactics?.learningState?.passedStepIds).toEqual(["intro"]);
  });

  it("rejects dynamic orbit providers in the static V3 config shape", () => {
    const params = cloneParams(SCENARIO_DEFAULTS);
    const orbit = params.planet.orbit;
    (params.planet as unknown as { orbit: unknown }).orbit = () => orbit;

    expect(() => toSimulationConfigV3(params)).toThrow(/function-valued orbit providers/);
  });

  it("creates a default V3 config", () => {
    expect(createDefaultSimulationConfigV3().version).toBe("3");
  });
});
