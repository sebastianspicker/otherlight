import { describe, expect, it } from "vitest";

import { DEFAULT_BINARY_LAB_CONFIG_V4 } from "../../src/app/binaryLab";
import { binaryFluxDisplayBaseline, fluxValueForDisplay } from "../../src/app/displayFlux";
import { ScientificBrowserRuntimeError } from "../../src/sim/v4";
import { buildNativeSnapshot, computeFluxBundle } from "../../src/sim/v4/nativeModel";
import type { SimulationConfigV4 } from "../../src/sim/v4/types";
import { createSimulationV4 } from "../../src/sim/v4/runtime";

describe("v4 native binary photometry", () => {
  it("computes mutual stellar eclipses with two luminous stars", async () => {
    const cfg: SimulationConfigV4 = {
      version: "4",
      mode: "detached-binary-lab",
      runtime: { mode: "realtime" },
      observer: { dir: { x: 1, y: 0, z: 0 } },
      bodies: {
        stars: [
          { id: "star-a", r: 1, m: 2, luminosityScale: 1 },
          { id: "star-b", r: 1, m: 1, luminosityScale: 0.5 },
        ],
        planets: [],
        moons: [],
      },
      orbits: {
        binary: { a: 0.2, e: 0, inc: 0, Omega: 0, omega: 0, period: 10, t0: 0 },
        hierarchy: [],
      },
      photometry: { baselineFlux: 1 },
    };

    const sim = createSimulationV4(cfg);
    await sim.prepare();
    const step = sim.step(0);

    // Baseline luminous sum is 1.5, but at t=0 star-b sits in front and eclipses star-a strongly.
    expect(step.flux.total).toBeLessThan(1.5);
    // transitFactor only reflects planet/moon transits, not binary eclipses.
    // With no planets, transitFactor should be 1.
    expect(step.flux.transitFactor).toBe(1);
    expect(step.flux.decomposition?.binaryEclipseTerms).toBeLessThan(1);
    expect(step.flux.decomposition?.stellarA).toBeLessThan(1);
    expect(step.flux.decomposition?.stellarB).toBeGreaterThan(0);
  });

  it("keeps sky-plane depth ordering aligned with the binary eclipse flux drop", () => {
    const snap = buildNativeSnapshot(DEFAULT_BINARY_LAB_CONFIG_V4, 0);
    const flux = computeFluxBundle(DEFAULT_BINARY_LAB_CONFIG_V4, snap, 0);
    const [starA, starB] = snap.stars;
    const front = starA.sky.z > starB.sky.z ? starA : starB;
    const back = front.id === starA.id ? starB : starA;
    const separation = Math.hypot(front.sky.x - back.sky.x, front.sky.y - back.sky.y);

    expect(flux.binaryEclipseFactor).toBeLessThan(1);
    expect(front.sky.z).toBeGreaterThan(back.sky.z);
    expect(separation).toBeLessThan(front.r + back.r);
  });

  it("exports binary render geometry in the primary-star-relative sky frame", async () => {
    const sim = createSimulationV4(DEFAULT_BINARY_LAB_CONFIG_V4);
    await sim.prepare();
    const step = sim.step(0);
    const snap = buildNativeSnapshot(DEFAULT_BINARY_LAB_CONFIG_V4, 0);
    const [starA, starB] = snap.stars;

    expect(step.renderSignals.orbitFrames.planetSky.x).toBeCloseTo(starB.sky.x - starA.sky.x, 12);
    expect(step.renderSignals.orbitFrames.planetSky.y).toBeCloseTo(starB.sky.y - starA.sky.y, 12);
    expect(step.renderSignals.orbitFrames.planetSky.z).toBeCloseTo(starB.sky.z - starA.sky.z, 12);
    expect(step.renderSignals.occulterGeometry[0]?.body).toBe("star");
  });

  it("reports the unobscured combined stellar baseline in detached-binary diagnostics", async () => {
    const sim = createSimulationV4(DEFAULT_BINARY_LAB_CONFIG_V4);
    await sim.prepare();
    const step = sim.step(0);
    const baseline = binaryFluxDisplayBaseline(DEFAULT_BINARY_LAB_CONFIG_V4);
    const expectedBaseline = 1.2137894473977964;

    expect(step.debug?.baselineFluxUsed).toBeCloseTo(expectedBaseline, 12);
    expect(step.debug?.baselineFluxUsed).toBeCloseTo(baseline ?? 0, 12);
    expect(step.flux.total).toBeLessThan(step.debug?.baselineFluxUsed ?? Number.POSITIVE_INFINITY);
  });

  it("prefers per-star physical bandpass weighting over scalar luminosity scales when stellar metadata is present", async () => {
    const cfg: SimulationConfigV4 = {
      version: "4",
      mode: "detached-binary-lab",
      runtime: { mode: "realtime" },
      observer: { dir: { x: 1, y: 0, z: 0 } },
      bodies: {
        stars: [
          { id: "star-a", r: 1.15, m: 2, luminosityScale: 1, teffK: 6_450, passband: "g" },
          { id: "star-b", r: 0.82, m: 1, luminosityScale: 5, teffK: 5_450, passband: "g" },
        ],
        planets: [],
        moons: [],
      },
      orbits: {
        binary: { a: 0.2, e: 0, inc: 0, Omega: 0, omega: 0, period: 10, t0: 0 },
        hierarchy: [],
      },
      photometry: { baselineFlux: 1, limbDarkeningModel: { bandpass: "g" } },
    };

    const baseline = binaryFluxDisplayBaseline(cfg);
    const sim = createSimulationV4(cfg);
    await sim.prepare();
    const step = sim.step(0);

    expect(baseline).toBeLessThan(2);
    expect(step.debug?.baselineFluxUsed).toBeCloseTo(baseline ?? 0, 12);
  });

  it("keeps scientific-browser debug baseline aligned with the detached-binary display baseline", async () => {
    const cfg = structuredClone(DEFAULT_BINARY_LAB_CONFIG_V4);
    cfg.runtime = { ...(cfg.runtime ?? {}), executionMode: "scientific-browser" };
    cfg.dynamics = {
      ...(cfg.dynamics ?? {}),
      relativity: {
        enabled: false,
        ltte: false,
        shapiro: false,
        grPrecession: false,
      },
    };

    const baseline = binaryFluxDisplayBaseline(cfg);
    const sim = createSimulationV4(cfg);
    await sim.prepare();
    const step = sim.step(0);

    expect(baseline).toBeDefined();
    expect(step.debug?.baselineFluxUsed).toBeCloseTo(baseline ?? 0, 12);
  });

  it("reports the same detached-binary display flux value used by the UI", async () => {
    const cfg = structuredClone(DEFAULT_BINARY_LAB_CONFIG_V4);
    cfg.runtime = { ...(cfg.runtime ?? {}), executionMode: "scientific-browser" };
    cfg.dynamics = {
      ...(cfg.dynamics ?? {}),
      relativity: {
        enabled: false,
        ltte: false,
        shapiro: false,
        grPrecession: false,
      },
    };

    const sim = createSimulationV4(cfg);
    await sim.prepare();
    const step = sim.step(0);

    expect(step.debug?.displayFluxValue).toBeCloseTo(fluxValueForDisplay(cfg, step.flux.total), 12);
  });

  it("uses limb darkening for detached-binary mutual eclipses when configured", async () => {
    const baseCfg: SimulationConfigV4 = {
      version: "4",
      mode: "detached-binary-lab",
      runtime: { mode: "realtime" },
      observer: { dir: { x: 1, y: 0, z: 0 } },
      bodies: {
        stars: [
          { id: "star-a", r: 1, m: 2, luminosityScale: 1 },
          { id: "star-b", r: 0.5, m: 1, luminosityScale: 0.35 },
        ],
        planets: [],
        moons: [],
      },
      orbits: {
        binary: { a: 0.2, e: 0, inc: 0, Omega: 0, omega: 0, period: 10, t0: 0 },
        hierarchy: [],
      },
      photometry: { baselineFlux: 1 },
    };
    const ldCfg: SimulationConfigV4 = {
      ...baseCfg,
      photometry: {
        ...baseCfg.photometry,
        limbDarkeningModel: {
          default: { kind: "quadratic", u1: 0.7, u2: 0.1 },
        },
        gridRes: 280,
      },
    };

    const simUniform = createSimulationV4(baseCfg);
    const simLd = createSimulationV4(ldCfg);
    await simUniform.prepare();
    await simLd.prepare();

    const uniform = simUniform.step(0);
    const limbDarkened = simLd.step(0);

    expect(limbDarkened.flux.decomposition?.stellarA).toBeLessThan(
      uniform.flux.decomposition?.stellarA ?? Number.POSITIVE_INFINITY,
    );
    expect(limbDarkened.flux.total).toBeLessThan(uniform.flux.total);
  });

  it("uses the occulted star's own stellar profile during detached-binary mutual eclipses", () => {
    const baseCfg: SimulationConfigV4 = {
      version: "4",
      mode: "detached-binary-lab",
      runtime: { mode: "realtime" },
      observer: { dir: { x: 1, y: 0, z: 0 } },
      bodies: {
        stars: [
          {
            id: "star-a",
            r: 1,
            m: 1,
            teffK: 6_700,
            loggCgs: 4.0,
            metallicityDex: -0.1,
            passband: "g",
          },
          {
            id: "star-b",
            r: 0.55,
            m: 1,
            teffK: 4_900,
            loggCgs: 4.7,
            metallicityDex: 0.2,
            passband: "g",
          },
        ],
        planets: [],
        moons: [],
      },
      orbits: {
        binary: { a: 0.2, e: 0, inc: 0, Omega: 0, omega: 0, period: 10, t0: 0 },
        hierarchy: [],
      },
      photometry: {
        baselineFlux: 1,
        limbDarkeningModel: {
          default: { kind: "quadratic", u1: 0.2, u2: 0.1 },
          bandpass: "g",
        },
      },
    };

    const hotOcculted = structuredClone(baseCfg);
    const coolOcculted = structuredClone(baseCfg);
    coolOcculted.bodies.stars[0].teffK = 4_900;
    coolOcculted.bodies.stars[0].loggCgs = 4.7;
    coolOcculted.bodies.stars[0].metallicityDex = 0.2;

    const snapHot = buildNativeSnapshot(hotOcculted, 0);
    const fluxHot = computeFluxBundle(hotOcculted, snapHot, 0);
    const visHot = fluxHot.stellarA / snapHot.stars[0].luminosity;

    const snapCool = buildNativeSnapshot(coolOcculted, 0);
    const fluxCool = computeFluxBundle(coolOcculted, snapCool, 0);
    const visCool = fluxCool.stellarA / snapCool.stars[0].luminosity;

    expect(visHot).not.toBeCloseTo(visCool, 6);
  });

  it("rejects direct native detached-binary scientific-browser snapshots that lack explicit passbands", () => {
    const cfg = structuredClone(DEFAULT_BINARY_LAB_CONFIG_V4);
    cfg.runtime = { ...(cfg.runtime ?? {}), executionMode: "scientific-browser" };
    delete cfg.bodies.stars[0].passband;
    delete cfg.bodies.stars[1].passband;

    let caught: unknown;
    try {
      buildNativeSnapshot(cfg, 0);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ScientificBrowserRuntimeError);
    expect((caught as ScientificBrowserRuntimeError).stage).toBe("native-inputs");
    expect((caught as ScientificBrowserRuntimeError).code).toBe("SCB_INVALID_NATIVE_INPUTS");
    expect((caught as ScientificBrowserRuntimeError).details[0]).toContain(
      'star "star-a" must define an explicit passband',
    );
  });

  it("prefers direct native detached-binary scientific-browser physical bandpass inputs over compatibility luminosity scales", () => {
    const cfg: SimulationConfigV4 = {
      version: "4",
      mode: "detached-binary-lab",
      runtime: { mode: "realtime", executionMode: "scientific-browser" },
      observer: { dir: { x: 1, y: 0, z: 0 } },
      bodies: {
        stars: [
          { id: "star-a", r: 1, m: 2, luminosityScale: 1, teffK: 6_200, loggCgs: 4.2, passband: "g" },
          { id: "star-b", r: 1, m: 1, luminosityScale: 0.4, teffK: 5_300, loggCgs: 4.4, passband: "g" },
        ],
        planets: [],
        moons: [],
      },
      orbits: {
        binary: { a: 0.2, e: 0, inc: 0, Omega: 0, omega: 0, period: 10, t0: 0 },
        hierarchy: [],
      },
      photometry: { baselineFlux: 1, limbDarkeningModel: { bandpass: "g" } },
    };

    const snap = buildNativeSnapshot(cfg, 0);

    expect(snap.stars).toHaveLength(2);
  });

  it("rejects direct native detached-binary scientific-browser snapshots without a limb-darkening model", () => {
    const cfg = structuredClone(DEFAULT_BINARY_LAB_CONFIG_V4);
    cfg.runtime = { ...(cfg.runtime ?? {}), executionMode: "scientific-browser" };
    delete cfg.photometry?.limbDarkeningModel;

    let caught: unknown;
    try {
      buildNativeSnapshot(cfg, 0);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ScientificBrowserRuntimeError);
    expect((caught as ScientificBrowserRuntimeError).stage).toBe("native-inputs");
    expect((caught as ScientificBrowserRuntimeError).code).toBe("SCB_INVALID_NATIVE_INPUTS");
    expect((caught as ScientificBrowserRuntimeError).details[0]).toContain("photometry.limbDarkeningModel");
  });

  it("rejects direct native detached-binary scientific-browser snapshots that rely on generic limb-darkening defaults", () => {
    const cfg = structuredClone(DEFAULT_BINARY_LAB_CONFIG_V4);
    cfg.runtime = { ...(cfg.runtime ?? {}), executionMode: "scientific-browser" };
    cfg.photometry = { ...(cfg.photometry ?? {}), limbDarkeningModel: { bandpass: "g" } };
    delete cfg.bodies.stars[0].loggCgs;

    let caught: unknown;
    try {
      buildNativeSnapshot(cfg, 0);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ScientificBrowserRuntimeError);
    expect((caught as ScientificBrowserRuntimeError).stage).toBe("native-inputs");
    expect((caught as ScientificBrowserRuntimeError).code).toBe("SCB_INVALID_NATIVE_INPUTS");
    expect((caught as ScientificBrowserRuntimeError).details[0]).toContain(
      'star "star-a" must define a finite positive loggCgs',
    );
  });

  it("rejects direct native detached-binary scientific-browser snapshots with unsupported explicit passbands", () => {
    const cfg = structuredClone(DEFAULT_BINARY_LAB_CONFIG_V4);
    cfg.runtime = { ...(cfg.runtime ?? {}), executionMode: "scientific-browser" };
    cfg.bodies.stars[0].passband = "bogus" as never;

    let caught: unknown;
    try {
      buildNativeSnapshot(cfg, 0);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ScientificBrowserRuntimeError);
    expect((caught as ScientificBrowserRuntimeError).stage).toBe("native-inputs");
    expect((caught as ScientificBrowserRuntimeError).code).toBe("SCB_INVALID_NATIVE_INPUTS");
    expect((caught as ScientificBrowserRuntimeError).details[0]).toContain('star "star-a" passband "bogus"');
  });

  it("rejects direct native detached-binary scientific-browser snapshots without finite stellar temperatures", () => {
    const cfg = structuredClone(DEFAULT_BINARY_LAB_CONFIG_V4);
    cfg.runtime = { ...(cfg.runtime ?? {}), executionMode: "scientific-browser" };
    delete cfg.bodies.stars[0].teffK;

    let caught: unknown;
    try {
      buildNativeSnapshot(cfg, 0);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ScientificBrowserRuntimeError);
    expect((caught as ScientificBrowserRuntimeError).stage).toBe("native-inputs");
    expect((caught as ScientificBrowserRuntimeError).code).toBe("SCB_INVALID_NATIVE_INPUTS");
    expect((caught as ScientificBrowserRuntimeError).details[0]).toContain(
      'star "star-a" must define a finite positive teffK',
    );
  });
});
