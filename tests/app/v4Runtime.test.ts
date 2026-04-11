import { describe, expect, it } from "vitest";

import { buildBinaryLabParams } from "../../src/app/binaryLab";
import { cloneParams, SCENARIO_DEFAULTS } from "../../src/app/scenario";
import { createSimulationV4, migrateSystemParamsToV4, ScientificBrowserRuntimeError } from "../../src/sim/v4";
import {
  createSimulationRuntimeV4FromParams,
  stripUnsupportedPhotometryForV4Runtime,
} from "../../src/app/v4Runtime";

function disableExcludedScientificPhotometry(system: ReturnType<typeof buildBinaryLabParams>): void {
  system.star.photometry = {
    ...system.star.photometry,
    phaseCurve: { enabled: false, reflAmp: 0, thermAmp: 0, constant: 0 },
    moonPhaseCurve: { enabled: false, reflAmp: 0, thermAmp: 0, constant: 0 },
    dayNightVisibility: { enabled: false },
    thermalModelAdvanced: { enabled: false },
    atmosphereTransmission: { enabled: false, target: "planet" },
    atmosphereRT: { enabled: false, target: "planet", layers: [] },
    forwardScattering: { enabled: false, amp: 0 },
    ringScattering: { enabled: false, amp: 0 },
  };
  system.dynamics = {
    ...(system.dynamics ?? {}),
    relativity: {
      enabled: false,
      ltte: false,
      shapiro: false,
      grPrecession: false,
    },
  };
}

describe("app v4 runtime builder", () => {
  it("preserves scattering photometry when cloning app-state params for runtime rebuilds", () => {
    const system = buildBinaryLabParams();
    system.star.photometry = {
      ...system.star.photometry,
      forwardScattering: { enabled: true, amp: 0.03, kind: "hg-angle", g: 0.85 },
      ringScattering: { enabled: true, amp: 0.02, sigmaPhase: 0.2 },
    };

    const next = stripUnsupportedPhotometryForV4Runtime(system);

    expect(next).not.toBe(system);
    expect(next.star.photometry?.forwardScattering).toEqual(system.star.photometry?.forwardScattering);
    expect(next.star.photometry?.ringScattering).toEqual(system.star.photometry?.ringScattering);
    expect(system.star.photometry?.forwardScattering).toBeDefined();
    expect(system.star.photometry?.ringScattering).toBeDefined();
  });

  it("preserves scattering terms in the V4 runtime config", () => {
    const system = buildBinaryLabParams();
    system.star.photometry = {
      ...system.star.photometry,
      forwardScattering: { enabled: true, amp: 0.03, kind: "hg-angle", g: 0.85 },
      ringScattering: { enabled: true, amp: 0.02, sigmaPhase: 0.2 },
    };

    const runtime = createSimulationRuntimeV4FromParams({
      system,
      binaryMode: false,
      runtimeMode: "realtime",
    });

    const cfg = runtime.getConfig();
    expect(cfg.photometry?.forwardScattering).toEqual(system.star.photometry?.forwardScattering);
    expect(cfg.photometry?.ringScattering).toEqual(system.star.photometry?.ringScattering);
    expect(runtime.takeStatusMessage()).toBeUndefined();
  });

  it("clears migrated hierarchy links in detached binary mode", async () => {
    const system = buildBinaryLabParams();
    system.binaryStars = {
      primary: { luminosityScale: 1, teffK: 6_350, loggCgs: 4.15, metallicityDex: -0.05, passband: "g" },
      secondary: { luminosityScale: 0.42, teffK: 5_250, loggCgs: 4.45, metallicityDex: -0.1, passband: "r" },
    };

    const runtime = createSimulationRuntimeV4FromParams({
      system,
      binaryMode: true,
      runtimeMode: "realtime",
    });

    const cfg = runtime.getConfig();
    expect(cfg.mode).toBe("detached-binary-lab");
    expect(cfg.bodies.planets).toEqual([]);
    expect(cfg.bodies.moons).toEqual([]);
    expect(cfg.orbits.hierarchy).toEqual([]);
    expect(cfg.bodies.stars[0].teffK).toBe(6_350);
    expect(cfg.bodies.stars[0].passband).toBe("g");
    expect(cfg.bodies.stars[1].teffK).toBe(5_250);
    expect(cfg.bodies.stars[1].passband).toBe("r");
    expect(cfg.bodies.stars[1].luminosityScale).toBeCloseTo(0.42, 12);

    await runtime.prepare();
    expect(() => runtime.step(0)).not.toThrow();
  });

  it("rejects additive photometry in scientific-browser mode without an explicit higher-fidelity composition declaration", () => {
    const system = buildBinaryLabParams();
    system.star.photometry = {
      ...system.star.photometry,
      additiveComposition: undefined,
      phaseCurve: { enabled: true, reflAmp: 0.02, thermAmp: 0.01 },
    };

    let caught: unknown;
    try {
      createSimulationRuntimeV4FromParams({
        system,
        binaryMode: false,
        runtimeMode: "realtime",
        executionMode: "scientific-browser",
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ScientificBrowserRuntimeError);
    expect((caught as ScientificBrowserRuntimeError).stage).toBe("config");
    expect((caught as ScientificBrowserRuntimeError).code).toBe("SCB_ADDITIVE_FLUX_INVALID_CONFIG");
    expect((caught as ScientificBrowserRuntimeError).details[0]).toContain(
      'photometry.additiveComposition must be explicitly set to "higher-fidelity-coupled"',
    );
    expect((caught as ScientificBrowserRuntimeError).details).toContain("photometry.phaseCurve");
  });

  it("preserves scientific-browser execution mode for supported detached-binary configs", async () => {
    const system = buildBinaryLabParams();
    disableExcludedScientificPhotometry(system);

    const runtime = createSimulationRuntimeV4FromParams({
      system,
      binaryMode: true,
      runtimeMode: "realtime",
      executionMode: "scientific-browser",
    });

    expect(runtime.getConfig().runtime?.executionMode).toBe("scientific-browser");
    await runtime.prepare();
    expect(() => runtime.step(0)).not.toThrow();
  });

  it("allows declared higher-fidelity phase channels in scientific-browser mode", async () => {
    const system = cloneParams(SCENARIO_DEFAULTS);
    system.star.photometry = {
      ...system.star.photometry,
      additiveComposition: "higher-fidelity-coupled",
      phaseCurve: {
        enabled: true,
        reflAmp: 0.03,
        thermAmp: 0.02,
        reflOffset: 0,
        thermOffset: 0,
        lambertian: true,
        physicalScaling: false,
        constant: 0,
      },
      moonPhaseCurve: {
        enabled: true,
        reflAmp: 0.01,
        thermAmp: 0.005,
        lambertian: true,
        physicalScaling: false,
      },
      dayNightVisibility: {
        enabled: true,
        clamp: true,
        reflectedModel: "lambert",
        thermalModel: "constant",
      },
      forwardScattering: { enabled: false, amp: 0 },
      ringScattering: { enabled: false, amp: 0 },
    };

    const runtime = createSimulationRuntimeV4FromParams({
      system,
      binaryMode: false,
      runtimeMode: "realtime",
      executionMode: "scientific-browser",
    });

    expect(runtime.getConfig().photometry?.additiveComposition).toBe("higher-fidelity-coupled");
    await runtime.prepare();
    const step = runtime.step(0);
    expect(Number.isFinite(step.flux.total)).toBe(true);
    expect(step.flux.planetPhase).toBeGreaterThan(0);
    expect(step.flux.moonPhase).toBeGreaterThan(0);
  });

  it("allows declared higher-fidelity forward scattering in scientific-browser mode", async () => {
    const system = cloneParams(SCENARIO_DEFAULTS);
    system.star.photometry = {
      ...system.star.photometry,
      additiveComposition: "higher-fidelity-coupled",
      phaseCurve: { enabled: false, reflAmp: 0, thermAmp: 0, constant: 0, lambertian: true },
      moonPhaseCurve: { enabled: false, reflAmp: 0, thermAmp: 0, constant: 0, lambertian: true },
      forwardScattering: {
        enabled: true,
        amp: 0.03,
        kind: "gaussian-time",
        sigmaPhase: 0.3,
      },
      ringScattering: { enabled: false, amp: 0 },
    };

    const runtime = createSimulationRuntimeV4FromParams({
      system,
      binaryMode: false,
      runtimeMode: "realtime",
      executionMode: "scientific-browser",
    });

    await runtime.prepare();
    let step = runtime.step(0);
    for (let i = 1; i <= 200; i++) {
      step = runtime.step(i * 500);
      if ((step.flux.forwardScattering ?? 0) > 0) break;
    }

    expect(step.flux.forwardScattering).toBeGreaterThan(0);
    expect(step.flux.decomposition?.forwardScattering).toBe(step.flux.forwardScattering);
  });

  it("allows declared higher-fidelity ring scattering in scientific-browser mode when planet rings are present", async () => {
    const system = cloneParams(SCENARIO_DEFAULTS);
    system.planet.rings = {
      innerRadius: system.planet.r * 1.2,
      outerRadius: system.planet.r * 1.8,
      inclination: 0.5,
      positionAngle: 0.1,
    };
    system.star.photometry = {
      ...system.star.photometry,
      additiveComposition: "higher-fidelity-coupled",
      phaseCurve: { enabled: false, reflAmp: 0, thermAmp: 0, constant: 0, lambertian: true },
      moonPhaseCurve: { enabled: false, reflAmp: 0, thermAmp: 0, constant: 0, lambertian: true },
      forwardScattering: { enabled: false, amp: 0 },
      ringScattering: {
        enabled: true,
        amp: 0.02,
        sigmaPhase: 0.25,
      },
    };

    const runtime = createSimulationRuntimeV4FromParams({
      system,
      binaryMode: false,
      runtimeMode: "realtime",
      executionMode: "scientific-browser",
    });

    await runtime.prepare();
    let step = runtime.step(0);
    for (let i = 1; i <= 200; i++) {
      step = runtime.step(i * 500);
      if ((step.flux.ringScattering ?? 0) > 0) break;
    }

    expect(step.flux.ringScattering).toBeGreaterThan(0);
    expect(step.flux.decomposition?.ringScattering).toBe(step.flux.ringScattering);
  });

  it("allows bounded circle-only atmosphere RT in scientific-browser mode", async () => {
    const system = buildBinaryLabParams();
    disableExcludedScientificPhotometry(system);
    system.star.photometry = {
      ...system.star.photometry,
      atmosphereRT: {
        enabled: true,
        target: "planet",
        lambdaRefNm: 550,
        layers: [{ r0: system.planet.r, H: system.planet.r * 0.15, tau0: 0.4 }],
      },
    };

    const runtime = createSimulationRuntimeV4FromParams({
      system,
      binaryMode: false,
      runtimeMode: "realtime",
      executionMode: "scientific-browser",
    });

    expect(runtime.getConfig().runtime?.executionMode).toBe("scientific-browser");
    await runtime.prepare();
    const step = runtime.step(0);
    expect(Number.isFinite(step.flux.total)).toBe(true);
  });

  it("rejects non-circular planet geometry on the scientific-browser atmosphereRT path", () => {
    const system = buildBinaryLabParams();
    disableExcludedScientificPhotometry(system);
    system.planet.shape = { ...(system.planet.shape ?? {}), oblateness: 0.1 };
    system.star.photometry = {
      ...system.star.photometry,
      atmosphereRT: {
        enabled: true,
        target: "planet",
        lambdaRefNm: 550,
        layers: [{ r0: system.planet.r, H: system.planet.r * 0.15, tau0: 0.4 }],
      },
    };

    let caught: unknown;
    try {
      createSimulationRuntimeV4FromParams({
        system,
        binaryMode: false,
        runtimeMode: "realtime",
        executionMode: "scientific-browser",
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ScientificBrowserRuntimeError);
    expect((caught as ScientificBrowserRuntimeError).stage).toBe("config");
    expect((caught as ScientificBrowserRuntimeError).code).toBe("SCB_TRANSMISSION_MIXED_SHAPE");
    expect((caught as ScientificBrowserRuntimeError).details[0]).toContain(
      'planet "planet-1" has shape.oblateness > 0',
    );
  });

  it("rejects atmosphereTransmission on the scientific-browser native path", () => {
    const system = buildBinaryLabParams();
    disableExcludedScientificPhotometry(system);
    system.star.photometry = {
      ...system.star.photometry,
      atmosphereTransmission: {
        enabled: true,
        target: "planet",
        kind: "exponential-halo",
        tau0: 0.8,
        H: system.planet.r * 0.15,
      },
    };

    let caught: unknown;
    try {
      createSimulationRuntimeV4FromParams({
        system,
        binaryMode: false,
        runtimeMode: "realtime",
        executionMode: "scientific-browser",
      });
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
    const system = buildBinaryLabParams();
    disableExcludedScientificPhotometry(system);
    system.star.photometry = {
      ...system.star.photometry,
      atmosphereRT: {
        enabled: true,
        target: "planet",
        layers: [{ r0: system.planet.r, H: system.planet.r * 0.15, tau0: 0.4 }],
        emission: { enabled: true, amp: 0.01, phaseLag: 0.2 },
      },
    };

    let caught: unknown;
    try {
      createSimulationRuntimeV4FromParams({
        system,
        binaryMode: false,
        runtimeMode: "realtime",
        executionMode: "scientific-browser",
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ScientificBrowserRuntimeError);
    expect((caught as ScientificBrowserRuntimeError).stage).toBe("config");
    expect((caught as ScientificBrowserRuntimeError).code).toBe("SCB_TRANSMISSION_RT_FEATURE_UNSUPPORTED");
    expect((caught as ScientificBrowserRuntimeError).details[0]).toContain(
      "photometry.atmosphereRT.emission is not yet supported",
    );
  });

  it("rejects atmosphereRT spectral-slope controls on the scientific-browser native path", () => {
    const system = buildBinaryLabParams();
    disableExcludedScientificPhotometry(system);
    system.star.photometry = {
      ...system.star.photometry,
      atmosphereRT: {
        enabled: true,
        target: "planet",
        lambdaRefNm: 550,
        layers: [{ r0: system.planet.r, H: system.planet.r * 0.15, tau0: 0.4, alpha: 1.2 }],
      },
    };

    let caught: unknown;
    try {
      createSimulationRuntimeV4FromParams({
        system,
        binaryMode: false,
        runtimeMode: "realtime",
        executionMode: "scientific-browser",
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ScientificBrowserRuntimeError);
    expect((caught as ScientificBrowserRuntimeError).stage).toBe("config");
    expect((caught as ScientificBrowserRuntimeError).code).toBe("SCB_TRANSMISSION_RT_FEATURE_UNSUPPORTED");
    expect((caught as ScientificBrowserRuntimeError).details[0]).toContain(
      "photometry.atmosphereRT.layers[0].alpha is not yet supported",
    );
  });

  it("rejects atmosphereRT configs without valid attenuation layers on the scientific-browser native path", () => {
    const system = buildBinaryLabParams();
    disableExcludedScientificPhotometry(system);
    system.star.photometry = {
      ...system.star.photometry,
      atmosphereRT: {
        enabled: true,
        target: "planet",
        layers: [],
        cloudHaze: { enabled: true, cloudDeckTau: 0.2, hazeTau: 0.1, hazeSlope: 0 },
      },
    };

    let caught: unknown;
    try {
      createSimulationRuntimeV4FromParams({
        system,
        binaryMode: false,
        runtimeMode: "realtime",
        executionMode: "scientific-browser",
      });
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

  it("rejects non-finite or negative gray atmosphereRT inputs on the scientific-browser native path", () => {
    const system = buildBinaryLabParams();
    disableExcludedScientificPhotometry(system);
    system.star.photometry = {
      ...system.star.photometry,
      atmosphereRT: {
        enabled: true,
        target: "planet",
        layers: [{ r0: system.planet.r, H: system.planet.r * 0.15, tau0: 0.4, cloudOpacity: -0.2 }],
      },
    };

    let caught: unknown;
    try {
      createSimulationRuntimeV4FromParams({
        system,
        binaryMode: false,
        runtimeMode: "realtime",
        executionMode: "scientific-browser",
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ScientificBrowserRuntimeError);
    expect((caught as ScientificBrowserRuntimeError).stage).toBe("config");
    expect((caught as ScientificBrowserRuntimeError).code).toBe("SCB_TRANSMISSION_RT_INVALID_INPUTS");
    expect((caught as ScientificBrowserRuntimeError).details[0]).toContain(
      "photometry.atmosphereRT.layers[0].cloudOpacity must be finite and >= 0",
    );
  });

  it("rejects atmosphereRT configs without an explicit target on the scientific-browser native path", () => {
    const system = buildBinaryLabParams();
    disableExcludedScientificPhotometry(system);
    system.star.photometry = {
      ...system.star.photometry,
      atmosphereRT: {
        enabled: true,
        layers: [{ r0: system.planet.r, H: system.planet.r * 0.15, tau0: 0.4 }],
      },
    };

    let caught: unknown;
    try {
      createSimulationRuntimeV4FromParams({
        system,
        binaryMode: false,
        runtimeMode: "realtime",
        executionMode: "scientific-browser",
      });
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

  it("rejects degenerate observer directions in scientific-browser mode", () => {
    const system = buildBinaryLabParams();
    system.observer = { dir: { x: 0, y: 0, z: 0 } };
    disableExcludedScientificPhotometry(system);

    const runtime = createSimulationRuntimeV4FromParams({
      system,
      binaryMode: true,
      runtimeMode: "realtime",
      executionMode: "scientific-browser",
    });

    let caught: unknown;
    try {
      runtime.step(0);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ScientificBrowserRuntimeError);
    expect((caught as ScientificBrowserRuntimeError).stage).toBe("native-inputs");
    expect((caught as ScientificBrowserRuntimeError).code).toBe("SCB_INVALID_NATIVE_INPUTS");
    expect((caught as ScientificBrowserRuntimeError).details).toContain("observer.dir must be non-zero");
  });

  it("rejects invalid oblateness that interactive native geometry would otherwise flatten away", () => {
    const system = buildBinaryLabParams();
    disableExcludedScientificPhotometry(system);
    system.star.shape = { ...(system.star.shape ?? {}), oblateness: 1.2 };

    const runtime = createSimulationRuntimeV4FromParams({
      system,
      binaryMode: true,
      runtimeMode: "realtime",
      executionMode: "scientific-browser",
    });

    let caught: unknown;
    try {
      runtime.step(0);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ScientificBrowserRuntimeError);
    expect((caught as ScientificBrowserRuntimeError).stage).toBe("native-inputs");
    expect((caught as ScientificBrowserRuntimeError).code).toBe("SCB_INVALID_NATIVE_INPUTS");
    expect((caught as ScientificBrowserRuntimeError).details).toContain(
      'star "star-a" shape.oblateness must be finite and in [0,1) when provided',
    );
  });

  it("rejects out-of-range reference substeps in scientific-browser mode", () => {
    const system = buildBinaryLabParams();
    disableExcludedScientificPhotometry(system);
    const cfg = migrateSystemParamsToV4(system);
    cfg.mode = "detached-binary-lab";
    cfg.bodies.planets = [];
    cfg.bodies.moons = [];
    cfg.orbits.hierarchy = [];
    cfg.runtime = {
      ...(cfg.runtime ?? {}),
      mode: "reference",
      executionMode: "scientific-browser",
      referenceSubsteps: 50,
    };

    let caught: unknown;
    try {
      createSimulationV4(cfg);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ScientificBrowserRuntimeError);
    expect((caught as ScientificBrowserRuntimeError).stage).toBe("config");
    expect((caught as ScientificBrowserRuntimeError).code).toBe("SCB_INVALID_REFERENCE_SUBSTEPS");
    expect((caught as ScientificBrowserRuntimeError).details[0]).toContain("runtime.referenceSubsteps");
  });

  it("rejects invalid exomoon timing reference epochs in scientific-browser mode", () => {
    const system = buildBinaryLabParams();
    disableExcludedScientificPhotometry(system);
    system.dynamics = {
      ...(system.dynamics ?? {}),
      exomoonTimingShape: {
        ...(system.dynamics?.exomoonTimingShape ?? {}),
        tRef: Number.NaN,
      },
    };

    let caught: unknown;
    try {
      createSimulationRuntimeV4FromParams({
        system,
        binaryMode: true,
        runtimeMode: "realtime",
        executionMode: "scientific-browser",
      });
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

  it("rejects implicit stellar-surface granulation timescale fallback in scientific-browser mode", () => {
    const system = buildBinaryLabParams();
    disableExcludedScientificPhotometry(system);
    system.star.photometry = {
      ...system.star.photometry,
      stellarSurface: {
        enabled: true,
        granulationSigma: 0.0005,
      },
    };

    let caught: unknown;
    try {
      createSimulationRuntimeV4FromParams({
        system,
        binaryMode: false,
        runtimeMode: "realtime",
        executionMode: "scientific-browser",
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ScientificBrowserRuntimeError);
    expect((caught as ScientificBrowserRuntimeError).stage).toBe("config");
    expect((caught as ScientificBrowserRuntimeError).code).toBe("SCB_INVALID_STELLAR_SURFACE");
    expect((caught as ScientificBrowserRuntimeError).details[0]).toContain(
      "photometry.stellarSurface.granulationTimescaleSec",
    );
  });

  it("prefers detached-binary physical bandpass inputs over compatibility luminosity scales in scientific-browser mode", () => {
    const system = buildBinaryLabParams();
    disableExcludedScientificPhotometry(system);
    system.binaryStars = {
      primary: { luminosityScale: 1, teffK: 6_350, passband: "g" },
      secondary: { luminosityScale: 0.4, teffK: 5_250, passband: "g" },
    };

    const runtime = createSimulationRuntimeV4FromParams({
      system,
      binaryMode: true,
      runtimeMode: "realtime",
      executionMode: "scientific-browser",
    });

    expect(runtime.step(0).debug?.baselineFluxUsed).toBeGreaterThan(1);
  });

  it("rejects legacy detached-binary scientific-browser inputs that rely on global passband fallback", () => {
    const system = buildBinaryLabParams();
    disableExcludedScientificPhotometry(system);
    system.binaryStars = {
      primary: { teffK: 6_350, loggCgs: 4.15, metallicityDex: -0.05 },
      secondary: { teffK: 5_250, loggCgs: 4.45, metallicityDex: -0.1 },
    };

    let caught: unknown;
    try {
      createSimulationRuntimeV4FromParams({
        system,
        binaryMode: true,
        runtimeMode: "realtime",
        executionMode: "scientific-browser",
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ScientificBrowserRuntimeError);
    expect((caught as ScientificBrowserRuntimeError).stage).toBe("config");
    expect((caught as ScientificBrowserRuntimeError).code).toBe("SCB_BINARY_IMPLICIT_PASSBAND");
    expect((caught as ScientificBrowserRuntimeError).details[0]).toContain(
      "system.binaryStars.primary.passband must be explicit",
    );
  });

  it("rejects legacy detached-binary scientific-browser inputs without finite stellar temperatures", () => {
    const system = buildBinaryLabParams();
    disableExcludedScientificPhotometry(system);
    system.binaryStars = {
      primary: { loggCgs: 4.15, metallicityDex: -0.05, passband: "g" },
      secondary: { teffK: 5_250, loggCgs: 4.45, metallicityDex: -0.1, passband: "g" },
    };

    let caught: unknown;
    try {
      createSimulationRuntimeV4FromParams({
        system,
        binaryMode: true,
        runtimeMode: "realtime",
        executionMode: "scientific-browser",
      });
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

  it("rejects legacy detached-binary scientific-browser inputs that rely on generic limb-darkening defaults", () => {
    const system = buildBinaryLabParams();
    disableExcludedScientificPhotometry(system);
    system.star.photometry = {
      ...system.star.photometry,
      limbDarkeningModel: { bandpass: "g" },
    };
    system.binaryStars = {
      primary: { teffK: 6_350, metallicityDex: -0.05, passband: "g" },
      secondary: { teffK: 5_250, loggCgs: 4.45, metallicityDex: -0.1, passband: "g" },
    };

    let caught: unknown;
    try {
      createSimulationRuntimeV4FromParams({
        system,
        binaryMode: true,
        runtimeMode: "realtime",
        executionMode: "scientific-browser",
      });
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

  it("rejects legacy binary orbit providers in scientific-browser mode before V4 sanitization can hide them", () => {
    const system = buildBinaryLabParams();
    disableExcludedScientificPhotometry(system);
    system.planet.orbit = (() => ({
      a: 1,
      e: 0,
      inc: Math.PI / 2,
      Omega: 0,
      omega: 0,
      period: 1,
      t0: 0,
    })) as typeof system.planet.orbit;

    let caught: unknown;
    try {
      createSimulationRuntimeV4FromParams({
        system,
        binaryMode: true,
        runtimeMode: "realtime",
        executionMode: "scientific-browser",
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ScientificBrowserRuntimeError);
    expect((caught as ScientificBrowserRuntimeError).stage).toBe("config");
    expect((caught as ScientificBrowserRuntimeError).code).toBe("SCB_INVALID_LEGACY_ORBIT");
    expect((caught as ScientificBrowserRuntimeError).details[0]).toContain(
      "system.planet.orbit (binary orbit) must be a static orbit object in scientific-browser mode",
    );
  });
});
