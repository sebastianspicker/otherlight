import { describe, expect, it } from "vitest";

import type { SimulationConfigV4 } from "../../src/sim/v4/types";
import { ScientificBrowserRuntimeError } from "../../src/sim/v4";
import { createSimulationV4 } from "../../src/sim/v4/runtime";

describe("sim v4 runtime", () => {
  it("rejects direct V4 detached-binary scientific-browser configs without finite stellar temperatures", () => {
    const cfg: SimulationConfigV4 = {
      version: "4",
      mode: "detached-binary-lab",
      runtime: { mode: "realtime", executionMode: "scientific-browser" },
      observer: { dir: { x: 1, y: 0, z: 1 } },
      bodies: {
        stars: [
          { id: "star-a", r: 6.957e8, m: 1.98847e30, passband: "g" },
          { id: "star-b", r: 5.0e8, m: 1.2e30, teffK: 5300, passband: "g" },
        ],
        planets: [],
        moons: [],
      },
      orbits: {
        binary: { a: 1.4e10, e: 0.1, inc: 1.55, Omega: 0.1, omega: 0.3, period: 8.0e5, t0: 0 },
        hierarchy: [],
      },
      photometry: { baselineFlux: 1 },
    };

    let caught: unknown;
    try {
      createSimulationV4(cfg);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ScientificBrowserRuntimeError);
    expect((caught as ScientificBrowserRuntimeError).stage).toBe("config");
    expect((caught as ScientificBrowserRuntimeError).code).toBe("SCB_BINARY_INVALID_STELLAR_INPUTS");
    expect((caught as ScientificBrowserRuntimeError).details[0]).toContain(
      'star "star-a" must define a finite positive teffK',
    );
  });

  it("rejects direct V4 detached-binary scientific-browser configs without finite stellar radii", () => {
    const cfg: SimulationConfigV4 = {
      version: "4",
      mode: "detached-binary-lab",
      runtime: { mode: "realtime", executionMode: "scientific-browser" },
      observer: { dir: { x: 1, y: 0, z: 1 } },
      bodies: {
        stars: [
          { id: "star-a", r: 0, m: 1.98847e30, teffK: 6200, passband: "g" },
          { id: "star-b", r: 5.0e8, m: 1.2e30, teffK: 5300, passband: "g" },
        ],
        planets: [],
        moons: [],
      },
      orbits: {
        binary: { a: 1.4e10, e: 0.1, inc: 1.55, Omega: 0.1, omega: 0.3, period: 8.0e5, t0: 0 },
        hierarchy: [],
      },
      photometry: { baselineFlux: 1 },
    };

    let caught: unknown;
    try {
      createSimulationV4(cfg);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ScientificBrowserRuntimeError);
    expect((caught as ScientificBrowserRuntimeError).stage).toBe("config");
    expect((caught as ScientificBrowserRuntimeError).code).toBe("SCB_BINARY_INVALID_STELLAR_INPUTS");
    expect((caught as ScientificBrowserRuntimeError).details[0]).toContain(
      'star "star-a" must define a finite positive radius',
    );
  });

  it("rejects direct V4 detached-binary scientific-browser configs without a limb-darkening model", () => {
    const cfg: SimulationConfigV4 = {
      version: "4",
      mode: "detached-binary-lab",
      runtime: { mode: "realtime", executionMode: "scientific-browser" },
      observer: { dir: { x: 1, y: 0, z: 1 } },
      bodies: {
        stars: [
          { id: "star-a", r: 6.957e8, m: 1.98847e30, teffK: 6200, passband: "g", loggCgs: 4.2 },
          { id: "star-b", r: 5.0e8, m: 1.2e30, teffK: 5300, passband: "g", loggCgs: 4.4 },
        ],
        planets: [],
        moons: [],
      },
      orbits: {
        binary: { a: 1.4e10, e: 0.1, inc: 1.55, Omega: 0.1, omega: 0.3, period: 8.0e5, t0: 0 },
        hierarchy: [],
      },
      photometry: { baselineFlux: 1 },
    };

    let caught: unknown;
    try {
      createSimulationV4(cfg);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ScientificBrowserRuntimeError);
    expect((caught as ScientificBrowserRuntimeError).stage).toBe("config");
    expect((caught as ScientificBrowserRuntimeError).code).toBe("SCB_BINARY_LIMB_DARKENING_FALLBACK");
    expect((caught as ScientificBrowserRuntimeError).details[0]).toContain("photometry.limbDarkeningModel");
  });

  it("rejects direct V4 detached-binary scientific-browser configs that rely on generic limb-darkening defaults", () => {
    const cfg: SimulationConfigV4 = {
      version: "4",
      mode: "detached-binary-lab",
      runtime: { mode: "realtime", executionMode: "scientific-browser" },
      observer: { dir: { x: 1, y: 0, z: 1 } },
      bodies: {
        stars: [
          { id: "star-a", r: 6.957e8, m: 1.98847e30, teffK: 6200, passband: "g" },
          { id: "star-b", r: 5.0e8, m: 1.2e30, teffK: 5300, passband: "g", loggCgs: 4.4 },
        ],
        planets: [],
        moons: [],
      },
      orbits: {
        binary: { a: 1.4e10, e: 0.1, inc: 1.55, Omega: 0.1, omega: 0.3, period: 8.0e5, t0: 0 },
        hierarchy: [],
      },
      photometry: { baselineFlux: 1, limbDarkeningModel: { bandpass: "g" } },
    };

    let caught: unknown;
    try {
      createSimulationV4(cfg);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ScientificBrowserRuntimeError);
    expect((caught as ScientificBrowserRuntimeError).stage).toBe("config");
    expect((caught as ScientificBrowserRuntimeError).code).toBe("SCB_BINARY_LIMB_DARKENING_FALLBACK");
    expect((caught as ScientificBrowserRuntimeError).details[0]).toContain(
      'star "star-a" must define a finite positive loggCgs',
    );
  });

  it("rejects direct V4 scientific-browser configs with invalid exomoon timing reference epochs", () => {
    const cfg: SimulationConfigV4 = {
      version: "4",
      mode: "detached-binary-lab",
      runtime: { mode: "realtime", executionMode: "scientific-browser" },
      observer: { dir: { x: 1, y: 0, z: 1 } },
      bodies: {
        stars: [
          { id: "star-a", r: 6.957e8, m: 1.98847e30, teffK: 6200, loggCgs: 4.2, passband: "g" },
          { id: "star-b", r: 5.0e8, m: 1.2e30, teffK: 5300, loggCgs: 4.4, passband: "g" },
        ],
        planets: [],
        moons: [],
      },
      orbits: {
        binary: { a: 1.4e10, e: 0.1, inc: 1.55, Omega: 0.1, omega: 0.3, period: 8.0e5, t0: 0 },
        hierarchy: [],
      },
      photometry: { baselineFlux: 1 },
      dynamics: {
        exomoonTimingShape: {
          enabled: true,
          tRef: Number.NaN,
        },
      },
    };

    let caught: unknown;
    try {
      createSimulationV4(cfg);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ScientificBrowserRuntimeError);
    expect((caught as ScientificBrowserRuntimeError).stage).toBe("config");
    expect((caught as ScientificBrowserRuntimeError).code).toBe("SCB_INVALID_TIMING_REFERENCE");
    expect((caught as ScientificBrowserRuntimeError).details[0]).toContain(
      "dynamics.exomoonTimingShape.tRef",
    );
  });

  it("rejects direct V4 scientific-browser relativity configs that rely on implicit model and solver defaults", () => {
    const cfg: SimulationConfigV4 = {
      version: "4",
      mode: "detached-binary-lab",
      runtime: { mode: "realtime", executionMode: "scientific-browser" },
      observer: { dir: { x: 1, y: 0, z: 1 } },
      bodies: {
        stars: [
          { id: "star-a", r: 6.957e8, m: 1.98847e30, teffK: 6200, loggCgs: 4.2, passband: "g" },
          { id: "star-b", r: 5.0e8, m: 1.2e30, teffK: 5300, loggCgs: 4.4, passband: "g" },
        ],
        planets: [],
        moons: [],
      },
      orbits: {
        binary: { a: 1.4e10, e: 0.1, inc: 1.55, Omega: 0.1, omega: 0.3, period: 8.0e5, t0: 0 },
        hierarchy: [],
      },
      photometry: { baselineFlux: 1 },
      dynamics: {
        relativity: {
          enabled: true,
        },
      },
    };

    let caught: unknown;
    try {
      createSimulationV4(cfg);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ScientificBrowserRuntimeError);
    expect((caught as ScientificBrowserRuntimeError).stage).toBe("config");
    expect((caught as ScientificBrowserRuntimeError).code).toBe("SCB_INVALID_RELATIVITY_CONFIG");
    expect((caught as ScientificBrowserRuntimeError).details).toEqual(
      expect.arrayContaining([
        expect.stringContaining("dynamics.relativityLevel"),
        expect.stringContaining("relativity.c"),
        expect.stringContaining("relativity.ltteIters"),
        expect.stringContaining("relativity.ltteTolSec"),
        expect.stringContaining("relativity.shapiroMinImpact"),
      ]),
    );
  });

  it("accepts explicit scientific-browser relativity model and solver controls", async () => {
    const cfg: SimulationConfigV4 = {
      version: "4",
      mode: "detached-binary-lab",
      runtime: { mode: "realtime", executionMode: "scientific-browser" },
      observer: { dir: { x: 1, y: 0, z: 1 } },
      bodies: {
        stars: [
          { id: "star-a", r: 6.957e8, m: 1.98847e30, teffK: 6200, loggCgs: 4.2, passband: "g" },
          { id: "star-b", r: 5.0e8, m: 1.2e30, teffK: 5300, loggCgs: 4.4, passband: "g" },
        ],
        planets: [],
        moons: [],
      },
      orbits: {
        binary: { a: 1.4e10, e: 0.1, inc: 1.55, Omega: 0.1, omega: 0.3, period: 8.0e5, t0: 0 },
        hierarchy: [],
      },
      photometry: { baselineFlux: 1, limbDarkeningModel: { bandpass: "g" } },
      dynamics: {
        relativityLevel: "toy",
        relativity: {
          enabled: true,
          c: 299_792_458,
          ltteIters: 8,
          ltteTolSec: 1e-12,
          shapiroMinImpact: 0,
        },
      },
    };

    const sim = createSimulationV4(cfg);
    await sim.prepare();
    const step = sim.step(0);

    expect(Number.isFinite(step.flux.total)).toBe(true);
    expect(step.physicsDiagnostics.ltteConvergence.status).toBe("unavailable");
    expect(step.physicsDiagnostics.shapiroConvergence.status).toBe("unavailable");
    expect(step.physicsDiagnostics.ltteConvergence.validityFlags).toContain("solver-not-run-native-path");
    expect(step.physicsDiagnostics.shapiroConvergence.validityFlags).toContain("solver-not-run-native-path");
  });

  it("does not fabricate TDV reference diagnostics without an explicit timing reference in scientific-browser mode", async () => {
    const cfg: SimulationConfigV4 = {
      version: "4",
      mode: "detached-binary-lab",
      runtime: { mode: "realtime", executionMode: "scientific-browser" },
      observer: { dir: { x: 1, y: 0, z: 1 } },
      bodies: {
        stars: [
          { id: "star-a", r: 6.957e8, m: 1.98847e30, teffK: 6200, loggCgs: 4.2, passband: "g" },
          { id: "star-b", r: 5.0e8, m: 1.2e30, teffK: 5300, loggCgs: 4.4, passband: "g" },
        ],
        planets: [],
        moons: [],
      },
      orbits: {
        binary: { a: 1.4e10, e: 0.1, inc: 1.55, Omega: 0.1, omega: 0.3, period: 8.0e5, t0: 0 },
        hierarchy: [],
      },
      photometry: { baselineFlux: 1, limbDarkeningModel: { bandpass: "g" } },
    };

    const sim = createSimulationV4(cfg);
    await sim.prepare();
    const step = sim.step(0);

    expect(Number.isFinite(step.debug?.vPlanetSky)).toBe(true);
    expect(step.debug?.vPlanetSkyRef).toBeUndefined();
    expect(step.debug?.tdvRatio).toBeUndefined();
  });

  it("rejects direct V4 scientific-browser configs with incomplete stellar-surface activity controls", () => {
    const cfg: SimulationConfigV4 = {
      version: "4",
      mode: "detached-binary-lab",
      runtime: { mode: "realtime", executionMode: "scientific-browser" },
      observer: { dir: { x: 1, y: 0, z: 1 } },
      bodies: {
        stars: [
          { id: "star-a", r: 6.957e8, m: 1.98847e30, teffK: 6200, passband: "g" },
          { id: "star-b", r: 5.0e8, m: 1.2e30, teffK: 5300, passband: "g" },
        ],
        planets: [],
        moons: [],
      },
      orbits: {
        binary: { a: 1.4e10, e: 0.1, inc: 1.55, Omega: 0.1, omega: 0.3, period: 8.0e5, t0: 0 },
        hierarchy: [],
      },
      photometry: {
        baselineFlux: 1,
        stellarSurface: {
          enabled: true,
          activityCycleAmp: 0.002,
        },
      },
    };

    let caught: unknown;
    try {
      createSimulationV4(cfg);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ScientificBrowserRuntimeError);
    expect((caught as ScientificBrowserRuntimeError).stage).toBe("config");
    expect((caught as ScientificBrowserRuntimeError).code).toBe("SCB_INVALID_STELLAR_SURFACE");
    expect((caught as ScientificBrowserRuntimeError).details[0]).toContain(
      "photometry.stellarSurface.activityCyclePeriodSec",
    );
  });

  it("rejects scientific-browser nbody configs that would otherwise inherit zero-mass fallbacks", () => {
    const cfg: SimulationConfigV4 = {
      version: "4",
      mode: "general-lab",
      runtime: { mode: "realtime", executionMode: "scientific-browser" },
      observer: { dir: { x: 1, y: 0, z: 1 } },
      bodies: {
        stars: [
          { id: "star-a", r: 6.957e8, m: 1.98847e30, teffK: 6200, passband: "g" },
          { id: "star-b", r: 1, m: 1, teffK: 5300, passband: "g", luminosityScale: 0 },
        ],
        planets: [
          {
            id: "planet-a",
            r: 7.1492e7,
            orbit: { a: 1.4e10, e: 0.02, inc: 1.55, Omega: 0.1, omega: 0.3, period: 8.0e5, t0: 0 },
          },
        ],
        moons: [
          {
            id: "moon-a",
            r: 1.7e6,
            m: 7.35e22,
            parentPlanetId: "planet-a",
            orbit: { a: 4.2e8, e: 0.01, inc: 0.02, Omega: 0.1, omega: 0.1, period: 1.5e5, t0: 0 },
          },
        ],
      },
      orbits: {
        binary: { a: 1, e: 0, inc: 0, Omega: 0, omega: 0, period: 1, t0: 0 },
        hierarchy: [{ childId: "moon-a", parentId: "planet-a", relation: "orbits" }],
      },
      photometry: { baselineFlux: 1 },
      dynamics: {
        nbodyPlanetMoon: {
          enabled: true,
          dtMax: 30,
        },
      },
    };

    let caught: unknown;
    try {
      createSimulationV4(cfg);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ScientificBrowserRuntimeError);
    expect((caught as ScientificBrowserRuntimeError).stage).toBe("config");
    expect((caught as ScientificBrowserRuntimeError).code).toBe("SCB_INVALID_NBODY_CONFIG");
    expect((caught as ScientificBrowserRuntimeError).details[0]).toContain(
      "scientific-browser nbodyPlanetMoon requires an explicit positive planet mass source",
    );
  });

  it("rejects mixed-shape atmospheric transmission in scientific-browser mode", () => {
    const cfg: SimulationConfigV4 = {
      version: "4",
      mode: "general-lab",
      runtime: { mode: "realtime", executionMode: "scientific-browser" },
      observer: { dir: { x: 1, y: 0, z: 1 } },
      bodies: {
        stars: [
          { id: "star-a", r: 6.957e8, m: 1.98847e30, teffK: 6200, passband: "g" },
          { id: "star-b", r: 1, m: 1, teffK: 5300, passband: "g", luminosityScale: 0 },
        ],
        planets: [
          {
            id: "planet-a",
            r: 7.1492e7,
            orbit: { a: 1.4e10, e: 0.02, inc: 1.55, Omega: 0.1, omega: 0.3, period: 8.0e5, t0: 0 },
            rings: { innerRadius: 9e7, outerRadius: 1.2e8, opacity: 0.4 },
          },
        ],
        moons: [],
      },
      orbits: {
        binary: { a: 1, e: 0, inc: 0, Omega: 0, omega: 0, period: 1, t0: 0 },
        hierarchy: [],
      },
      photometry: {
        baselineFlux: 1,
        atmosphereRT: {
          enabled: true,
          target: "planet",
          lambdaRefNm: 550,
          layers: [{ r0: 7.1492e7, H: 1.5e7, tau0: 1 }],
        },
      },
    };

    let caught: unknown;
    try {
      createSimulationV4(cfg);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ScientificBrowserRuntimeError);
    expect((caught as ScientificBrowserRuntimeError).stage).toBe("config");
    expect((caught as ScientificBrowserRuntimeError).code).toBe("SCB_TRANSMISSION_MIXED_SHAPE");
    expect((caught as ScientificBrowserRuntimeError).details[0]).toContain('planet "planet-a" has rings');
  });
});
