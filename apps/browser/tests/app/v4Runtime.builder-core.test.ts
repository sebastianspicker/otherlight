/** Verifies v4 runtime builder core contracts across app startup, controls, and runtime integration. */

import { expect, it } from "vitest";

import { buildBinaryLabParams } from "../../src/application/binaryLab";
import { toEducationScenarioV4 } from "../../src/application/browserScenarioAdapter";
import { cloneParams, SCENARIO_DEFAULTS } from "../../src/application/scenario";
import { createSimulationV4, ScientificBrowserRuntimeError } from "../../src/domain/simulation/v4";
import { createSimulationRuntimeV4FromParams } from "../../src/application/v4Runtime";

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

it("preserves scattering photometry when cloning app-state params for runtime rebuilds", () => {
  const system = buildBinaryLabParams();
  system.star.photometry = {
    ...system.star.photometry,
    forwardScattering: { enabled: true, amp: 0.03, kind: "hg-angle", g: 0.85 },
    ringScattering: { enabled: true, amp: 0.02, sigmaPhase: 0.2 },
  };

  const next = cloneParams(system);

  expect(next).not.toBe(system);
  expect(next.star.photometry?.forwardScattering).toEqual(system.star.photometry?.forwardScattering);
  expect(next.star.photometry?.ringScattering).toEqual(system.star.photometry?.ringScattering);
  expect(system.star.photometry?.forwardScattering).toBeDefined();
  expect(system.star.photometry?.ringScattering).toBeDefined();
});

it("converts browser authoring state once before canonical runtime ingress", async () => {
  const scenario = toEducationScenarioV4({
    system: cloneParams(SCENARIO_DEFAULTS),
    binaryMode: false,
    runtimeMode: "realtime",
  });

  expect(scenario.version).toBe("4");
  const runtime = createSimulationV4(scenario, {});
  await runtime.prepare();
  expect(runtime.getConfig()).toEqual(scenario);
  expect(Number.isFinite(runtime.step(0).flux.total)).toBe(true);
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

it("reports interactive V4 atmosphere RT controls that are still ignored by the native light-curve path", () => {
  const system = cloneParams(SCENARIO_DEFAULTS);
  system.star.photometry = {
    ...system.star.photometry,
    atmosphereRT: {
      enabled: true,
      target: "planet",
      lambdaRefNm: 550,
      layers: [{ r0: system.planet.r, H: 1.5e7, tau0: 0.8, temperatureK: 1200 }],
      temperatureProfileK: [1200, 1000],
      scattering: { enabled: true, gain: 0.02, g: 0.7 },
      emission: { enabled: true, amp: 0.01, phaseLag: 0.1 },
    },
  };

  const runtime = createSimulationRuntimeV4FromParams({
    system,
    binaryMode: false,
    runtimeMode: "realtime",
  });

  expect(runtime.takeStatusMessage()).toContain("photometry.atmosphereRT.temperatureProfileK");
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
