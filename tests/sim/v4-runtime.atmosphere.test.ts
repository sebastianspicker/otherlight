import { expect, it } from "vitest";

import { ScientificBrowserRuntimeError } from "../../src/sim/v4";
import { createSimulationV4 } from "../../src/sim/v4/runtime";
import type { SimulationConfigV4 } from "../../src/sim/v4/types";

type RuntimeErrorCode =
  | "SCB_TRANSMISSION_MIXED_SHAPE"
  | "SCB_TRANSMISSION_MODEL_UNSUPPORTED"
  | "SCB_TRANSMISSION_RT_FEATURE_UNSUPPORTED"
  | "SCB_TRANSMISSION_RT_NO_VALID_LAYERS"
  | "SCB_TRANSMISSION_RT_INVALID_INPUTS";

const PLANET_LAYER = { r0: 7.1492e7, H: 1.5e7, tau0: 1 };
const MOON_LAYER = { r0: 1.9e7, H: 4.0e6, tau0: 1 };

function baseConfig(): SimulationConfigV4 {
  return {
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
    photometry: { baselineFlux: 1 },
  };
}

function planetAtmosphereConfig(args: {
  planetPatch?: Partial<SimulationConfigV4["bodies"]["planets"][number]>;
  photometry: NonNullable<SimulationConfigV4["photometry"]>;
}): SimulationConfigV4 {
  const cfg = baseConfig();
  cfg.bodies.planets[0] = { ...cfg.bodies.planets[0], ...args.planetPatch };
  cfg.photometry = args.photometry;
  return cfg;
}

function moonAtmosphereConfig(args: {
  moonPatch?: Partial<SimulationConfigV4["bodies"]["moons"][number]>;
  photometry: NonNullable<SimulationConfigV4["photometry"]>;
}): SimulationConfigV4 {
  const cfg = baseConfig();
  cfg.bodies.moons = [
    {
      id: "moon-a",
      r: 1.9e7,
      orbit: { a: 2.5e8, e: 0.01, inc: 0.1, Omega: 0, omega: 0, period: 9.0e4, t0: 0 },
      parentPlanetId: "planet-a",
      ...args.moonPatch,
    },
  ];
  cfg.orbits.hierarchy = [{ childId: "moon-a", parentId: "planet-a", relation: "orbits" }];
  cfg.photometry = args.photometry;
  return cfg;
}

function atmosphereRT(target: "planet" | "moon", layer = target === "planet" ? PLANET_LAYER : MOON_LAYER) {
  return {
    enabled: true,
    target,
    lambdaRefNm: 550,
    layers: [layer],
  };
}

function expectScientificBrowserConfigError(
  cfg: SimulationConfigV4,
  code: RuntimeErrorCode,
  detail: string,
  name?: string,
): void {
  let caught: unknown;
  try {
    createSimulationV4(cfg);
  } catch (error) {
    caught = error;
  }
  expect(caught, name).toBeInstanceOf(ScientificBrowserRuntimeError);
  expect((caught as ScientificBrowserRuntimeError).stage, name).toBe("config");
  expect((caught as ScientificBrowserRuntimeError).code, name).toBe(code);
  expect((caught as ScientificBrowserRuntimeError).details[0], name).toContain(detail);
}

it("rejects the current non-circular atmosphereRT geometry matrix in scientific-browser mode", () => {
  const cases = [
    {
      name: "oblate planet",
      cfg: planetAtmosphereConfig({
        planetPatch: { shape: { oblateness: 0.1 } },
        photometry: { baselineFlux: 1, atmosphereRT: atmosphereRT("planet") },
      }),
      expectedDetail: 'planet "planet-a" has shape.oblateness > 0',
    },
    {
      name: "ringed moon",
      cfg: moonAtmosphereConfig({
        moonPatch: { rings: { innerRadius: 2.2e7, outerRadius: 2.8e7, opacity: 0.4 } },
        photometry: { baselineFlux: 1, atmosphereRT: atmosphereRT("moon") },
      }),
      expectedDetail: 'moon "moon-a" has rings',
    },
    {
      name: "oblate moon",
      cfg: moonAtmosphereConfig({
        moonPatch: { shape: { oblateness: 0.08 } },
        photometry: { baselineFlux: 1, atmosphereRT: atmosphereRT("moon") },
      }),
      expectedDetail: 'moon "moon-a" has shape.oblateness > 0',
    },
  ];

  for (const testCase of cases) {
    expectScientificBrowserConfigError(
      testCase.cfg,
      "SCB_TRANSMISSION_MIXED_SHAPE",
      testCase.expectedDetail,
      testCase.name,
    );
  }
});

it("rejects atmosphereTransmission on the scientific-browser native path", () => {
  const cfg = planetAtmosphereConfig({
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
  });

  expectScientificBrowserConfigError(
    cfg,
    "SCB_TRANSMISSION_MODEL_UNSUPPORTED",
    "photometry.atmosphereTransmission is not yet supported",
  );
});

it("rejects unsupported atmosphereRT feature controls on the scientific-browser native path", () => {
  const cfg = planetAtmosphereConfig({
    photometry: {
      baselineFlux: 1,
      atmosphereRT: { ...atmosphereRT("planet"), scattering: { enabled: true, gain: 0.02, g: 0.7 } },
    },
  });

  expectScientificBrowserConfigError(
    cfg,
    "SCB_TRANSMISSION_RT_FEATURE_UNSUPPORTED",
    "photometry.atmosphereRT.scattering is not yet supported",
  );
});

it("rejects atmosphereRT cloud-haze spectral controls on the scientific-browser native path", () => {
  const cfg = planetAtmosphereConfig({
    photometry: {
      baselineFlux: 1,
      atmosphereRT: {
        ...atmosphereRT("planet"),
        cloudHaze: { enabled: true, cloudDeckTau: 0.2, hazeTau: 0.1, hazeSlope: 0.7 },
      },
    },
  });

  expectScientificBrowserConfigError(
    cfg,
    "SCB_TRANSMISSION_RT_FEATURE_UNSUPPORTED",
    "photometry.atmosphereRT.cloudHaze.hazeSlope is not yet supported",
  );
});

it("rejects atmosphereRT configs without valid attenuation layers on the scientific-browser native path", () => {
  const cfg = planetAtmosphereConfig({
    photometry: {
      baselineFlux: 1,
      atmosphereRT: {
        enabled: true,
        target: "planet",
        layers: [],
        cloudHaze: { enabled: true, cloudDeckTau: 0.2, hazeTau: 0.1, hazeSlope: 0 },
      },
    },
  });

  expectScientificBrowserConfigError(
    cfg,
    "SCB_TRANSMISSION_RT_NO_VALID_LAYERS",
    "photometry.atmosphereRT requires at least one explicit valid attenuation layer",
  );
});

it("rejects invalid gray atmosphereRT numeric inputs on the scientific-browser native path", () => {
  const cfg = planetAtmosphereConfig({
    photometry: {
      baselineFlux: 1,
      atmosphereRT: {
        ...atmosphereRT("planet"),
        cloudHaze: { enabled: true, cloudDeckTau: -0.2, hazeTau: 0.1, hazeSlope: 0 },
      },
    },
  });

  expectScientificBrowserConfigError(
    cfg,
    "SCB_TRANSMISSION_RT_INVALID_INPUTS",
    "photometry.atmosphereRT.cloudHaze.cloudDeckTau must be finite and >= 0",
  );
});

it("rejects atmosphereRT configs without an explicit target on the scientific-browser native path", () => {
  const cfg = planetAtmosphereConfig({
    photometry: { baselineFlux: 1, atmosphereRT: { enabled: true, layers: [PLANET_LAYER] } },
  });

  expectScientificBrowserConfigError(
    cfg,
    "SCB_TRANSMISSION_RT_INVALID_INPUTS",
    'photometry.atmosphereRT.target must be explicitly "planet" or "moon"',
  );
});
