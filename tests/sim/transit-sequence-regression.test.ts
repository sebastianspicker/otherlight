/** Verifies transit sequence regression contracts across system state, transit observables, and V4 integration. */

import { describe, expect, it } from "vitest";

import type { SystemParams } from "../../src/core/types";
import { buildTransitSequenceDiagnostics } from "../helpers/transitSequence";

function buildKeplerTransitParams(): SystemParams {
  return {
    observer: { dir: { x: 0, y: 0, z: 1 } },
    star: { r: 1, m: 1, photometry: { baselineFlux: 1, gridRes: 300 } },
    planet: {
      r: 0.1,
      m: 1e-3,
      orbit: {
        a: 5,
        e: 0,
        inc: Math.PI / 2,
        Omega: 0,
        omega: 0,
        period: 1000,
        t0: 0,
      },
    },
  };
}

describe("transit sequence regression", () => {
  it("returns near-zero O-C for a stable keplerian planet transit sequence", () => {
    const params = buildKeplerTransitParams();

    const seq = buildTransitSequenceDiagnostics({
      system: params,
      body: "planet",
      aroundSec: 250,
      epochsBefore: 2,
      epochsAfter: 2,
    });

    expect(seq.events).toHaveLength(5);
    expect(seq.detectedCount).toBeGreaterThanOrEqual(5);
    expect((seq.rmsOcSec ?? Number.POSITIVE_INFINITY) < 1e-3).toBe(true);
    expect((seq.maxAbsOcSec ?? Number.POSITIVE_INFINITY) < 1e-2).toBe(true);
  });

  it("detects non-zero O-C in a perturbed n-body configuration", () => {
    const params: SystemParams = {
      ...buildKeplerTransitParams(),
      moon: {
        r: 0.03,
        m: 1e-5,
        orbitAroundPlanet: {
          a: 0.5,
          e: 0.02,
          inc: 0.2,
          Omega: 0.1,
          omega: 0.2,
          period: 220,
          t0: 0,
        },
      },
    };
    params.dynamics = params.dynamics ?? {};
    params.dynamics.nbodyPlanetMoon = {
      enabled: true,
      muStar: 5.0e-3,
      muPlanet: 1.0e-4,
      muMoon: 1.0e-6,
      dtMax: 2,
      softening: 1e-6,
      perturbers: [
        {
          enabled: true,
          mu: 8.0e-5,
          orbit: {
            a: 7.5,
            e: 0.12,
            inc: 0.25,
            Omega: 0.3,
            omega: 0.2,
            period: 1600,
            t0: 0,
          },
        },
      ],
    };

    const seq = buildTransitSequenceDiagnostics({
      system: params,
      body: "planet",
      aroundSec: 250,
      epochsBefore: 4,
      epochsAfter: 4,
    });

    expect(seq.detectedCount).toBeGreaterThan(0);
    expect(Number.isFinite(seq.maxAbsOcSec)).toBe(true);
    expect((seq.maxAbsOcSec ?? 0) > 1e-9).toBe(true);
  });
});
