/** Verifies v4 scattering parity contracts across system state, transit observables, and V4 integration. */

import { describe, expect, it } from "vitest";

import { cloneParams, SCENARIO_DEFAULTS } from "../../src/app/scenario";
import { migrateSystemParamsToV4 } from "../../src/sim/v4";
import { createSimulationV4 } from "../../src/sim/v4/runtime";

describe("v4 scattering parity", () => {
  it("preserves and emits configured forward and ring scattering terms", async () => {
    const params = cloneParams(SCENARIO_DEFAULTS);
    params.planet.rings = {
      innerRadius: params.planet.r * 1.2,
      outerRadius: params.planet.r * 1.8,
      inclination: 0.5,
      positionAngle: 0.1,
    };
    params.star.photometry = {
      ...params.star.photometry,
      phaseCurve: {
        enabled: false,
        reflAmp: 0,
        thermAmp: 0,
        reflOffset: 0,
        thermOffset: 0,
        lambertian: true,
      },
      moonPhaseCurve: {
        enabled: false,
        reflAmp: 0,
        thermAmp: 0,
        reflOffset: 0,
        thermOffset: 0,
        lambertian: true,
      },
      forwardScattering: {
        enabled: true,
        amp: 0.03,
        kind: "gaussian-time",
        sigmaPhase: 0.3,
      },
      ringScattering: {
        enabled: true,
        amp: 0.02,
        sigmaPhase: 0.25,
      },
    };

    const cfg = migrateSystemParamsToV4(params);
    const sim = createSimulationV4(cfg);
    await sim.prepare();

    let step = sim.step(0);
    for (let i = 1; i <= 200; i++) {
      step = sim.step(i * 500);
      if ((step.flux.forwardScattering ?? 0) > 0 && (step.flux.ringScattering ?? 0) > 0) break;
    }

    expect(step.flux.forwardScattering).toBeGreaterThan(0);
    expect(step.flux.ringScattering).toBeGreaterThan(0);
    expect(step.flux.decomposition?.forwardScattering).toBe(step.flux.forwardScattering);
    expect(step.flux.decomposition?.ringScattering).toBe(step.flux.ringScattering);
  });
});
