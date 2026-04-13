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
});
