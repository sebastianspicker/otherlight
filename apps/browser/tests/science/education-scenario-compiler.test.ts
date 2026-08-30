/** Verifies the canonical browser-scenario to science-service compilation boundary. */

import { describe, expect, it } from "vitest";
import type { OrbitElements, BrowserScenarioDraft } from "../../src/domain/model/types";
import { G_SI } from "../../src/domain/model/units";
import {
  DEFAULT_EPOCH_JD_TDB,
  buildScientificForwardRequestFromEducationScenarioV4,
  buildScientificScenarioV5FromEducationScenarioV4,
} from "../../src/infrastructure/science";
import { mapBrowserScenarioDraftToEducationScenarioV4 } from "../../src/domain/simulation/v4";
import { toEducationScenarioV4 } from "../../src/application/browserScenarioAdapter";

const period = (semiMajorAxisM: number, totalMassKg: number): number =>
  2 * Math.PI * Math.sqrt(semiMajorAxisM ** 3 / (G_SI * totalMassKg));

const orbit = (semiMajorAxisM: number, totalMassKg: number): OrbitElements => ({
  a: semiMajorAxisM,
  e: 0.1,
  inc: 0.2,
  Omega: 0.3,
  omega: 0.4,
  period: period(semiMajorAxisM, totalMassKg),
  t0: -500,
});

const starMassKg = 1.8e30;
const planetMassKg = 1.2e27;
const moonMassKg = 7.4e22;

const generalSystem = (): BrowserScenarioDraft => ({
  observer: { dir: { x: 0, y: 0, z: 2 } },
  star: { r: 6.0e8, m: starMassKg },
  planet: {
    r: 7.0e7,
    m: planetMassKg,
    orbit: orbit(1.0e11, starMassKg + planetMassKg + moonMassKg),
  },
  moon: {
    r: 1.7e6,
    m: moonMassKg,
    orbitAroundPlanet: orbit(5.0e8, planetMassKg + moonMassKg),
  },
  binaryStars: {
    primary: { passband: "TESS" },
    secondary: { passband: "TESS" },
  },
});

type SystemCompilerInput = {
  system: BrowserScenarioDraft;
  binaryMode: boolean;
  id?: string;
  epochJdTdb?: number;
  targetBodyId?: string;
};

type SystemRequestInput = SystemCompilerInput & {
  startOffsetSec: number;
  endOffsetSec: number;
  sampleCadenceSec: number;
  seed: number;
};

const canonicalEducationScenario = ({ system, binaryMode }: SystemCompilerInput) =>
  toEducationScenarioV4({
    system,
    binaryMode,
    runtimeMode: "reference",
    executionMode: "scientific-browser",
  });

const compileSystemScenario = (input: SystemCompilerInput) =>
  buildScientificScenarioV5FromEducationScenarioV4({
    scenario: canonicalEducationScenario(input),
    id: input.id,
    epochJdTdb: input.epochJdTdb,
    targetBodyId: input.targetBodyId,
  });

const compileSystemRequest = (input: SystemRequestInput) =>
  buildScientificForwardRequestFromEducationScenarioV4({
    scenario: canonicalEducationScenario(input),
    id: input.id,
    epochJdTdb: input.epochJdTdb,
    targetBodyId: input.targetBodyId,
    startOffsetSec: input.startOffsetSec,
    endOffsetSec: input.endOffsetSec,
    sampleCadenceSec: input.sampleCadenceSec,
    seed: input.seed,
  });

const centreOfMassComponent = (
  bodies: ReturnType<typeof compileSystemScenario>["bodies"],
  field: "positionM" | "velocityMps",
  axis: 0 | 1 | 2,
): number => {
  const total = bodies.reduce((sum, body) => sum + body.massKg, 0);
  return bodies.reduce((sum, body) => sum + body.massKg * body.state[field][axis], 0) / total;
};

const expectDynamicsFailure = (mutate: (system: BrowserScenarioDraft) => void, message: string): void => {
  const system = generalSystem();
  mutate(system);
  expect(() => compileSystemScenario({ system, binaryMode: false })).toThrow(message);
};

type ExomoonTimingShape = NonNullable<NonNullable<BrowserScenarioDraft["dynamics"]>["exomoonTimingShape"]>;

const exomoonTimingControls: Array<
  [
    keyof Pick<ExomoonTimingShape, "moonOmegaDot" | "moonIncDot" | "moonOmegaSmallDot" | "moonImpactYDot">,
    number,
  ]
> = [
  ["moonOmegaDot", 1e-8],
  ["moonIncDot", 1e-8],
  ["moonOmegaSmallDot", 1e-8],
  ["moonImpactYDot", 1e-4],
];

describe("browser authoring state to V5 compiler", () => {
  it("builds a barycentric static star/planet/moon state with a numeric TDB epoch", () => {
    const scenario = compileSystemScenario({
      system: generalSystem(),
      binaryMode: false,
      epochJdTdb: 2_461_236.5,
      targetBodyId: "planet",
    });

    expect(scenario.bodies.map((body) => [body.id, body.kind])).toEqual([
      ["star", "star"],
      ["planet", "planet"],
      ["moon", "moon"],
    ]);
    expect(scenario.epochJdTdb).toBe(2_461_236.5);
    expect(scenario.observer).toEqual({ lineOfSight: [0, 0, 1], targetBodyId: "planet" });
    for (const field of ["positionM", "velocityMps"] as const) {
      for (const axis of [0, 1, 2] as const) {
        expect(Math.abs(centreOfMassComponent(scenario.bodies, field, axis))).toBeLessThan(1e-6);
      }
    }
  });

  it("maps a detached binary to star and companion and builds an RV-only request", () => {
    const system = generalSystem();
    delete system.moon;
    system.planet.orbit = orbit(2.0e10, starMassKg + planetMassKg);
    const scenario = compileSystemScenario({ system, binaryMode: true });
    const request = compileSystemRequest({
      system,
      binaryMode: true,
      startOffsetSec: -60,
      endOffsetSec: 60,
      sampleCadenceSec: 30,
      seed: 7,
    });

    expect(scenario.epochJdTdb).toBe(DEFAULT_EPOCH_JD_TDB);
    expect(scenario.bodies.map((body) => body.kind)).toEqual(["star", "companion"]);
    expect(request.outputs).toEqual(["radial-velocity"]);
  });

  it("uses the mass-derived period for a rounded static orbit with nonzero t0", () => {
    const exactSystem = generalSystem();
    const roundedSystem = generalSystem();
    const roundedOrbit = roundedSystem.planet.orbit as OrbitElements;
    roundedSystem.planet.orbit = { ...roundedOrbit, period: roundedOrbit.period * (1 + 1e-6) };

    const exact = compileSystemScenario({ system: exactSystem, binaryMode: false });
    const rounded = compileSystemScenario({ system: roundedSystem, binaryMode: false });

    expect((roundedSystem.planet.orbit as OrbitElements).t0).not.toBe(0);
    expect(rounded.bodies).toEqual(exact.bodies);
  });

  it("fails closed for providers, inconsistent periods, and missing masses", () => {
    const providerSystem = generalSystem();
    const staticPlanetOrbit = providerSystem.planet.orbit as OrbitElements;
    providerSystem.planet.orbit = () => staticPlanetOrbit;
    expect(() => compileSystemScenario({ system: providerSystem, binaryMode: false })).toThrow(
      /SCB_INVALID_LEGACY_ORBIT/,
    );

    const inconsistent = generalSystem();
    inconsistent.planet.orbit = { ...(inconsistent.planet.orbit as OrbitElements), period: 1 };
    expect(() => compileSystemScenario({ system: inconsistent, binaryMode: false })).toThrow(/inconsistent/);

    const missingMass = generalSystem();
    delete missingMass.moon!.m;
    expect(() => compileSystemScenario({ system: missingMass, binaryMode: false })).toThrow(
      /bodies\.moons\[0\]\.m/,
    );
  });

  it("rejects active browser N-body dynamics and enabled perturbers", () => {
    expectDynamicsFailure((system) => {
      system.dynamics = { nbodyPlanetMoon: { enabled: true } };
    }, "an already-active browser N-body state is unsupported.");
    expectDynamicsFailure((system) => {
      system.dynamics = { nbodyPlanetMoon: { perturbers: [{ enabled: true }] } };
    }, "additional N-body perturbers are unsupported.");
    expectDynamicsFailure((system) => {
      system.dynamics = { nbodyPlanetMoon: { perturbers: [{}] } };
    }, "additional N-body perturbers are unsupported.");
  });

  it("rejects active relativity and secular dynamics", () => {
    expectDynamicsFailure((system) => {
      system.dynamics = { relativity: { enabled: true } };
    }, "relativistic browser dynamics are unsupported.");
    expectDynamicsFailure((system) => {
      system.dynamics = { secular: { enabled: true } };
    }, "secular browser dynamics are unsupported.");
  });

  it("rejects time-dependent exomoon orientation and sky-plane drift", () => {
    for (const [field, value] of exomoonTimingControls) {
      expectDynamicsFailure((system) => {
        const timing: ExomoonTimingShape = { enabled: true };
        timing[field] = value;
        system.dynamics = { exomoonTimingShape: timing };
      }, "time-dependent exomoon orientation or sky-plane drift is unsupported.");
    }
  });

  it("rejects enabled tides for every body", () => {
    const bodyIds = { star: "star-a", planet: "planet-1", moon: "moon-1" } as const;
    for (const path of ["star", "planet", "moon"] as const) {
      expectDynamicsFailure((system) => {
        system[path]!.tides = { enabled: true };
      }, `body "${bodyIds[path]}" tides are unsupported.`);
    }
  });

  it("rejects nonzero and nonfinite J2 for every body", () => {
    const bodyIds = { star: "star-a", planet: "planet-1", moon: "moon-1" } as const;
    for (const path of ["star", "planet", "moon"] as const) {
      for (const j2 of [0.001, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
        expectDynamicsFailure((system) => {
          system[path]!.gravityHarmonics = { J2: j2 };
        }, `body "${bodyIds[path]}" gravityHarmonics.J2 is unsupported.`);
      }
    }
  });

  it("allows disabled browser dynamics and zero-valued unsupported controls", () => {
    const system = generalSystem();
    system.dynamics = {
      nbodyPlanetMoon: { enabled: false, perturbers: [{ enabled: false }] },
      relativity: { enabled: false },
      secular: { enabled: false },
      exomoonTimingShape: {
        enabled: true,
        moonOmegaDot: 0,
        moonIncDot: 0,
        moonOmegaSmallDot: 0,
        moonImpactYDot: 0,
      },
    };
    for (const path of ["star", "planet", "moon"] as const) {
      system[path]!.tides = { enabled: false };
      system[path]!.gravityHarmonics = { J2: 0 };
    }

    expect(() => compileSystemScenario({ system, binaryMode: false })).not.toThrow();
  });

  it("allows nonzero exomoon timing controls when timing is disabled", () => {
    const system = generalSystem();
    const timing: ExomoonTimingShape = { enabled: false };
    for (const [field, value] of exomoonTimingControls) timing[field] = value;
    system.dynamics = { exomoonTimingShape: timing };

    expect(() => compileSystemScenario({ system, binaryMode: false })).not.toThrow();
  });
});

describe("V5 Education V4 scenario compiler", () => {
  it("has byte-for-byte scenario and request parity with the browser authoring boundary", () => {
    const system = generalSystem();
    const scenario = mapBrowserScenarioDraftToEducationScenarioV4(system);
    const browserScenario = compileSystemScenario({
      system,
      binaryMode: false,
      epochJdTdb: 2_461_236.5,
      targetBodyId: "planet",
    });
    const v4Scenario = buildScientificScenarioV5FromEducationScenarioV4({
      scenario,
      epochJdTdb: 2_461_236.5,
      targetBodyId: "planet",
    });
    const browserRequest = compileSystemRequest({
      system,
      binaryMode: false,
      startOffsetSec: -60,
      endOffsetSec: 60,
      sampleCadenceSec: 30,
      seed: 7,
    });
    const v4Request = buildScientificForwardRequestFromEducationScenarioV4({
      scenario,
      startOffsetSec: -60,
      endOffsetSec: 60,
      sampleCadenceSec: 30,
      seed: 7,
    });

    expect(v4Scenario).toEqual(browserScenario);
    expect(v4Request).toEqual(browserRequest);
  });

  it("compiles the V4 detached-binary shape directly", () => {
    const system = generalSystem();
    delete system.moon;
    system.planet.orbit = orbit(2.0e10, starMassKg + planetMassKg);
    const scenario = mapBrowserScenarioDraftToEducationScenarioV4(system);
    scenario.mode = "detached-binary-lab";
    scenario.bodies.stars[1] = {
      ...scenario.bodies.stars[1],
      m: planetMassKg,
      r: system.planet.r,
    };
    scenario.bodies.planets = [];
    scenario.bodies.moons = [];
    scenario.orbits.hierarchy = [];

    expect(
      buildScientificScenarioV5FromEducationScenarioV4({ scenario }).bodies.map((body) => body.kind),
    ).toEqual(["star", "companion"]);
  });

  it("fails closed instead of dropping unsupported V4 bodies or dynamics", () => {
    const extraStar = mapBrowserScenarioDraftToEducationScenarioV4(generalSystem());
    extraStar.bodies.stars[1].m = 1;
    expect(() => buildScientificScenarioV5FromEducationScenarioV4({ scenario: extraStar })).toThrow(
      /secondary star.*unsupported/,
    );

    const extraPlanet = mapBrowserScenarioDraftToEducationScenarioV4(generalSystem());
    extraPlanet.bodies.planets.push({ ...extraPlanet.bodies.planets[0], id: "planet-2" });
    expect(() => buildScientificScenarioV5FromEducationScenarioV4({ scenario: extraPlanet })).toThrow(
      /exactly one planet/,
    );

    const relativistic = mapBrowserScenarioDraftToEducationScenarioV4(generalSystem());
    relativistic.dynamics = { relativity: { enabled: true } };
    expect(() => buildScientificScenarioV5FromEducationScenarioV4({ scenario: relativistic })).toThrow(
      /relativistic browser dynamics are unsupported/,
    );

    const shapedBody = mapBrowserScenarioDraftToEducationScenarioV4(generalSystem());
    shapedBody.bodies.planets[0].shape = { oblateness: 0.1 };
    expect(() => buildScientificScenarioV5FromEducationScenarioV4({ scenario: shapedBody })).toThrow(
      /shape settings are unsupported/,
    );
  });
});
