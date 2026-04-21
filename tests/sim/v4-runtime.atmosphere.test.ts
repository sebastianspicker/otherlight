import { describe, expect, it } from "vitest";

import type { SimulationConfigV4 } from "../../src/sim/v4/types";
import { ScientificBrowserRuntimeError } from "../../src/sim/v4";
import { createSimulationV4 } from "../../src/sim/v4/runtime";

describe("sim v4 runtime", () => {
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
