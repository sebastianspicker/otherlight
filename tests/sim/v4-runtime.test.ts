import { describe, expect, it } from "vitest";

import type { SimulationConfigV4 } from "../../src/sim/v4/types";
import { ScientificBrowserRuntimeError } from "../../src/sim/v4";
import { createSimulationV4 } from "../../src/sim/v4/runtime";

describe("sim v4 runtime", () => {
  it("steps in realtime and reference modes with finite flux", async () => {
    const cfg: SimulationConfigV4 = {
      version: "4",
      mode: "detached-binary-lab",
      runtime: { mode: "realtime" },
      observer: { dir: { x: 1, y: 0, z: 1 } },
      bodies: {
        stars: [
          { id: "star-a", r: 6.957e8, m: 1.98847e30, luminosityScale: 1 },
          { id: "star-b", r: 5.0e8, m: 1.2e30, luminosityScale: 0.35 },
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

    const sim = createSimulationV4(cfg);
    await sim.prepare();

    const realtime = sim.step(0);
    expect(Number.isFinite(realtime.flux.total)).toBe(true);

    sim.setMode("reference");
    const reference = sim.step(1000);
    expect(Number.isFinite(reference.flux.total)).toBe(true);
  });

  it("reports N-body enablement from the V4 config", async () => {
    const baseCfg: SimulationConfigV4 = {
      version: "4",
      mode: "detached-binary-lab",
      runtime: { mode: "realtime" },
      observer: { dir: { x: 1, y: 0, z: 1 } },
      bodies: {
        stars: [
          { id: "star-a", r: 6.957e8, m: 1.98847e30, luminosityScale: 1 },
          { id: "star-b", r: 5.0e8, m: 1.2e30, luminosityScale: 0.35 },
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

    const simDisabled = createSimulationV4(baseCfg);
    await simDisabled.prepare();
    expect(simDisabled.step(0).physicsDiagnostics?.integratorStats?.nbodyEnabled).toBe(false);

    const simEnabled = createSimulationV4({
      ...baseCfg,
      dynamics: {
        nbodyPlanetMoon: { enabled: true },
      },
    });
    await simEnabled.prepare();
    expect(simEnabled.step(0).physicsDiagnostics?.integratorStats?.nbodyEnabled).toBe(true);
  });

  it("rejects semantically invalid direct V4 orbits in scientific-browser mode", () => {
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
        binary: { a: 1.4e10, e: 1.1, inc: 1.55, Omega: 0.1, omega: 0.3, period: 8.0e5, t0: 0 },
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
    expect((caught as ScientificBrowserRuntimeError).code).toBe("SCB_INVALID_ORBIT");
    expect((caught as ScientificBrowserRuntimeError).details[0]).toContain(
      "orbits.binary.e must be in [0, 1)",
    );
  });

  it("allows direct V4 declared higher-fidelity forward scattering in scientific-browser mode", async () => {
    const cfg: SimulationConfigV4 = {
      version: "4",
      mode: "general-lab",
      runtime: { mode: "realtime", executionMode: "scientific-browser" },
      observer: { dir: { x: 1, y: 0, z: 1 } },
      bodies: {
        stars: [
          { id: "star-a", r: 6.957e8, m: 1.98847e30, teffK: 6200, loggCgs: 4.2, passband: "g" },
          { id: "star-b", r: 5.0e8, m: 1.2e30, luminosityScale: 0 },
        ],
        planets: [
          {
            id: "planet-1",
            r: 1.5e8,
            m: 3.5e28,
            orbit: { a: 2.4e9, e: 0, inc: 1.5603243512829308, Omega: 0, omega: 0, period: 63569.0153, t0: 0 },
          },
        ],
        moons: [],
      },
      orbits: {
        binary: { a: 1.4e10, e: 0.1, inc: 1.55, Omega: 0.1, omega: 0.3, period: 8.0e5, t0: 0 },
        hierarchy: [],
      },
      photometry: {
        baselineFlux: 1,
        limbDarkeningModel: { bandpass: "g" },
        additiveComposition: "higher-fidelity-coupled",
        phaseCurve: { enabled: false, reflAmp: 0, thermAmp: 0, constant: 0, lambertian: true },
        moonPhaseCurve: { enabled: false, reflAmp: 0, thermAmp: 0, constant: 0, lambertian: true },
        forwardScattering: { enabled: true, amp: 0.03, kind: "gaussian-time", sigmaPhase: 0.3 },
      },
    };

    const sim = createSimulationV4(cfg);
    await sim.prepare();

    let step = sim.step(0);
    for (let i = 1; i <= 200; i++) {
      step = sim.step(i * 500);
      if ((step.flux.forwardScattering ?? 0) > 0) break;
    }

    expect(step.flux.forwardScattering).toBeGreaterThan(0);
    expect(step.flux.decomposition?.forwardScattering).toBe(step.flux.forwardScattering);
  });

  it("allows direct V4 declared higher-fidelity ring scattering in scientific-browser mode when planet rings are present", async () => {
    const cfg: SimulationConfigV4 = {
      version: "4",
      mode: "general-lab",
      runtime: { mode: "realtime", executionMode: "scientific-browser" },
      observer: { dir: { x: 1, y: 0, z: 1 } },
      bodies: {
        stars: [
          { id: "star-a", r: 6.957e8, m: 1.98847e30, teffK: 6200, loggCgs: 4.2, passband: "g" },
          { id: "star-b", r: 5.0e8, m: 1.2e30, luminosityScale: 0 },
        ],
        planets: [
          {
            id: "planet-1",
            r: 1.5e8,
            m: 3.5e28,
            rings: {
              innerRadius: 1.8e8,
              outerRadius: 2.6e8,
              inclination: 0.5,
              positionAngle: 0.1,
            },
            orbit: { a: 2.4e9, e: 0, inc: 1.5603243512829308, Omega: 0, omega: 0, period: 63569.0153, t0: 0 },
          },
        ],
        moons: [],
      },
      orbits: {
        binary: { a: 1.4e10, e: 0.1, inc: 1.55, Omega: 0.1, omega: 0.3, period: 8.0e5, t0: 0 },
        hierarchy: [],
      },
      photometry: {
        baselineFlux: 1,
        limbDarkeningModel: { bandpass: "g" },
        additiveComposition: "higher-fidelity-coupled",
        phaseCurve: { enabled: false, reflAmp: 0, thermAmp: 0, constant: 0, lambertian: true },
        moonPhaseCurve: { enabled: false, reflAmp: 0, thermAmp: 0, constant: 0, lambertian: true },
        ringScattering: { enabled: true, amp: 0.02, sigmaPhase: 0.25 },
      },
    };

    const sim = createSimulationV4(cfg);
    await sim.prepare();

    let step = sim.step(0);
    for (let i = 1; i <= 200; i++) {
      step = sim.step(i * 500);
      if ((step.flux.ringScattering ?? 0) > 0) break;
    }

    expect(step.flux.ringScattering).toBeGreaterThan(0);
    expect(step.flux.decomposition?.ringScattering).toBe(step.flux.ringScattering);
  });

  it("rejects direct V4 declared higher-fidelity ring scattering in scientific-browser mode when planet rings are missing", () => {
    const cfg: SimulationConfigV4 = {
      version: "4",
      mode: "general-lab",
      runtime: { mode: "realtime", executionMode: "scientific-browser" },
      observer: { dir: { x: 1, y: 0, z: 1 } },
      bodies: {
        stars: [
          { id: "star-a", r: 6.957e8, m: 1.98847e30, teffK: 6200, loggCgs: 4.2, passband: "g" },
          { id: "star-b", r: 5.0e8, m: 1.2e30, luminosityScale: 0 },
        ],
        planets: [
          {
            id: "planet-1",
            r: 1.5e8,
            m: 3.5e28,
            orbit: { a: 2.4e9, e: 0, inc: 1.5603243512829308, Omega: 0, omega: 0, period: 63569.0153, t0: 0 },
          },
        ],
        moons: [],
      },
      orbits: {
        binary: { a: 1.4e10, e: 0.1, inc: 1.55, Omega: 0.1, omega: 0.3, period: 8.0e5, t0: 0 },
        hierarchy: [],
      },
      photometry: {
        baselineFlux: 1,
        limbDarkeningModel: { bandpass: "g" },
        additiveComposition: "higher-fidelity-coupled",
        phaseCurve: { enabled: false, reflAmp: 0, thermAmp: 0, constant: 0, lambertian: true },
        moonPhaseCurve: { enabled: false, reflAmp: 0, thermAmp: 0, constant: 0, lambertian: true },
        ringScattering: { enabled: true, amp: 0.02, sigmaPhase: 0.25 },
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
    expect((caught as ScientificBrowserRuntimeError).code).toBe("SCB_ADDITIVE_FLUX_INVALID_CONFIG");
    expect((caught as ScientificBrowserRuntimeError).details[0]).toContain(
      "photometry.ringScattering requires the first explicit planet body to define rings",
    );
  });

  it("rejects direct V4 detached-binary scientific-browser configs that rely on global passband fallback", () => {
    const cfg: SimulationConfigV4 = {
      version: "4",
      mode: "detached-binary-lab",
      runtime: { mode: "realtime", executionMode: "scientific-browser" },
      observer: { dir: { x: 1, y: 0, z: 1 } },
      bodies: {
        stars: [
          { id: "star-a", r: 6.957e8, m: 1.98847e30, teffK: 6200 },
          { id: "star-b", r: 5.0e8, m: 1.2e30, teffK: 5300 },
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
    expect((caught as ScientificBrowserRuntimeError).code).toBe("SCB_BINARY_IMPLICIT_PASSBAND");
    expect((caught as ScientificBrowserRuntimeError).details[0]).toContain(
      'star "star-a" must define an explicit passband',
    );
  });

  it("rejects direct V4 detached-binary scientific-browser configs with unsupported explicit passbands", () => {
    const cfg: SimulationConfigV4 = {
      version: "4",
      mode: "detached-binary-lab",
      runtime: { mode: "realtime", executionMode: "scientific-browser" },
      observer: { dir: { x: 1, y: 0, z: 1 } },
      bodies: {
        stars: [
          { id: "star-a", r: 6.957e8, m: 1.98847e30, teffK: 6200, passband: "bogus" as never },
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
    expect((caught as ScientificBrowserRuntimeError).code).toBe("SCB_BINARY_UNSUPPORTED_PASSBAND");
    expect((caught as ScientificBrowserRuntimeError).details[0]).toContain('star "star-a" passband "bogus"');
  });

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

  it("rejects the current non-circular atmosphereRT geometry matrix in scientific-browser mode", () => {
    const cases: Array<{
      name: string;
      cfg: SimulationConfigV4;
      expectedDetail: string;
    }> = [
      {
        name: "oblate planet",
        cfg: {
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
                shape: { oblateness: 0.1 },
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
        },
        expectedDetail: 'planet "planet-a" has shape.oblateness > 0',
      },
      {
        name: "ringed moon",
        cfg: {
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
                r: 1.9e7,
                orbit: { a: 2.5e8, e: 0.01, inc: 0.1, Omega: 0, omega: 0, period: 9.0e4, t0: 0 },
                parentPlanetId: "planet-a",
                rings: { innerRadius: 2.2e7, outerRadius: 2.8e7, opacity: 0.4 },
              },
            ],
          },
          orbits: {
            binary: { a: 1, e: 0, inc: 0, Omega: 0, omega: 0, period: 1, t0: 0 },
            hierarchy: [{ childId: "moon-a", parentId: "planet-a", relation: "orbits" }],
          },
          photometry: {
            baselineFlux: 1,
            atmosphereRT: {
              enabled: true,
              target: "moon",
              lambdaRefNm: 550,
              layers: [{ r0: 1.9e7, H: 4.0e6, tau0: 1 }],
            },
          },
        },
        expectedDetail: 'moon "moon-a" has rings',
      },
      {
        name: "oblate moon",
        cfg: {
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
                r: 1.9e7,
                orbit: { a: 2.5e8, e: 0.01, inc: 0.1, Omega: 0, omega: 0, period: 9.0e4, t0: 0 },
                parentPlanetId: "planet-a",
                shape: { oblateness: 0.08 },
              },
            ],
          },
          orbits: {
            binary: { a: 1, e: 0, inc: 0, Omega: 0, omega: 0, period: 1, t0: 0 },
            hierarchy: [{ childId: "moon-a", parentId: "planet-a", relation: "orbits" }],
          },
          photometry: {
            baselineFlux: 1,
            atmosphereRT: {
              enabled: true,
              target: "moon",
              lambdaRefNm: 550,
              layers: [{ r0: 1.9e7, H: 4.0e6, tau0: 1 }],
            },
          },
        },
        expectedDetail: 'moon "moon-a" has shape.oblateness > 0',
      },
    ];

    for (const testCase of cases) {
      let caught: unknown;
      try {
        createSimulationV4(testCase.cfg);
      } catch (error) {
        caught = error;
      }

      expect(caught, testCase.name).toBeInstanceOf(ScientificBrowserRuntimeError);
      expect((caught as ScientificBrowserRuntimeError).stage, testCase.name).toBe("config");
      expect((caught as ScientificBrowserRuntimeError).code, testCase.name).toBe(
        "SCB_TRANSMISSION_MIXED_SHAPE",
      );
      expect((caught as ScientificBrowserRuntimeError).details[0], testCase.name).toContain(
        testCase.expectedDetail,
      );
    }
  });

  it("rejects atmosphereTransmission on the scientific-browser native path", () => {
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
        moons: [],
      },
      orbits: {
        binary: { a: 1, e: 0, inc: 0, Omega: 0, omega: 0, period: 1, t0: 0 },
        hierarchy: [],
      },
      photometry: {
        baselineFlux: 1,
        atmosphereTransmission: {
          enabled: true,
          target: "planet",
          kind: "exponential-halo",
          tau0: 1,
          H: 1.5e7,
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
    expect((caught as ScientificBrowserRuntimeError).code).toBe("SCB_TRANSMISSION_MODEL_UNSUPPORTED");
    expect((caught as ScientificBrowserRuntimeError).details[0]).toContain(
      "photometry.atmosphereTransmission is not yet supported",
    );
  });

  it("rejects unsupported atmosphereRT feature controls on the scientific-browser native path", () => {
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
          layers: [{ r0: 7.1492e7, H: 1.5e7, tau0: 1 }],
          scattering: { enabled: true, gain: 0.02, g: 0.7 },
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
    expect((caught as ScientificBrowserRuntimeError).code).toBe("SCB_TRANSMISSION_RT_FEATURE_UNSUPPORTED");
    expect((caught as ScientificBrowserRuntimeError).details[0]).toContain(
      "photometry.atmosphereRT.scattering is not yet supported",
    );
  });

  it("rejects atmosphereRT cloud-haze spectral controls on the scientific-browser native path", () => {
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
          cloudHaze: { enabled: true, cloudDeckTau: 0.2, hazeTau: 0.1, hazeSlope: 0.7 },
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
    expect((caught as ScientificBrowserRuntimeError).code).toBe("SCB_TRANSMISSION_RT_FEATURE_UNSUPPORTED");
    expect((caught as ScientificBrowserRuntimeError).details[0]).toContain(
      "photometry.atmosphereRT.cloudHaze.hazeSlope is not yet supported",
    );
  });

  it("rejects atmosphereRT configs without valid attenuation layers on the scientific-browser native path", () => {
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
          layers: [],
          cloudHaze: { enabled: true, cloudDeckTau: 0.2, hazeTau: 0.1, hazeSlope: 0 },
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
    expect((caught as ScientificBrowserRuntimeError).code).toBe("SCB_TRANSMISSION_RT_NO_VALID_LAYERS");
    expect((caught as ScientificBrowserRuntimeError).details[0]).toContain(
      "photometry.atmosphereRT requires at least one explicit valid attenuation layer",
    );
  });

  it("rejects invalid gray atmosphereRT numeric inputs on the scientific-browser native path", () => {
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
          layers: [{ r0: 7.1492e7, H: 1.5e7, tau0: 1 }],
          cloudHaze: { enabled: true, cloudDeckTau: -0.2, hazeTau: 0.1, hazeSlope: 0 },
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
    expect((caught as ScientificBrowserRuntimeError).code).toBe("SCB_TRANSMISSION_RT_INVALID_INPUTS");
    expect((caught as ScientificBrowserRuntimeError).details[0]).toContain(
      "photometry.atmosphereRT.cloudHaze.cloudDeckTau must be finite and >= 0",
    );
  });

  it("rejects atmosphereRT configs without an explicit target on the scientific-browser native path", () => {
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
    expect((caught as ScientificBrowserRuntimeError).code).toBe("SCB_TRANSMISSION_RT_INVALID_INPUTS");
    expect((caught as ScientificBrowserRuntimeError).details[0]).toContain(
      'photometry.atmosphereRT.target must be explicitly "planet" or "moon"',
    );
  });
});
