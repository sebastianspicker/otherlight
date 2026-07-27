/** Verifies validation assert dynamics contracts across system state, transit observables, and V4 integration. */

import { describe, expect, it } from "vitest";

import type { SystemParams } from "../../src/core/types";
import { assertDynamicsInputs } from "../../src/sim/validation/assertDynamics";

function baseParams(): SystemParams {
  return {
    star: { r: 7e8, m: 2e30 },
    planet: {
      r: 7e7,
      m: 1.9e27,
      orbit: { a: 1e11, e: 0.01, inc: 1.5, Omega: 0, omega: 0, period: 3e6, t0: 0 },
    },
  } as unknown as SystemParams;
}

function withNbody(params: SystemParams): SystemParams {
  const moonOrbit = { a: 4e8, e: 0, inc: 0, Omega: 0, omega: 0, period: 1e5, t0: 0 };
  return {
    ...params,
    moon: { r: 1e6, m: 1e23, orbitAroundPlanet: moonOrbit } as any,
    dynamics: {
      nbodyPlanetMoon: {
        enabled: true,
        muStar: 1.33e20,
        muPlanet: 1.27e17,
        muMoon: 6.67e12,
        dtMax: 1000,
      },
    } as any,
  };
}

describe("assertDynamicsInputs: nbody validation", () => {
  it("passes for valid nbody config", () => {
    expect(() => assertDynamicsInputs(withNbody(baseParams()))).not.toThrow();
  });

  it("throws when nbody enabled without moon", () => {
    const p = withNbody(baseParams());
    delete (p as any).moon;
    expect(() => assertDynamicsInputs(p)).toThrow(/moon/i);
  });

  it("throws when planet.orbit is a function under nbody", () => {
    const p = withNbody(baseParams());
    (p.planet as any).orbit = () => ({});
    expect(() => assertDynamicsInputs(p)).toThrow(/static.*planet.orbit/i);
  });

  it("throws when moon.orbitAroundPlanet is a function under nbody", () => {
    const p = withNbody(baseParams());
    (p as any).moon.orbitAroundPlanet = () => ({});
    expect(() => assertDynamicsInputs(p)).toThrow(/static.*moon/i);
  });

  it("throws when muStar is not positive (NaN/undefined, no star.m fallback)", () => {
    const p = withNbody(baseParams());
    (p.dynamics as any).nbodyPlanetMoon.muStar = NaN;
    delete (p.star as any).m; // prevent star.m fallback
    expect(() => assertDynamicsInputs(p)).toThrow(/muStar/i);
  });

  it("resolves muStar from mStar fallback", () => {
    const p = withNbody(baseParams());
    const nbody = (p.dynamics as any).nbodyPlanetMoon;
    delete nbody.muStar;
    nbody.mStar = 2e30;
    expect(() => assertDynamicsInputs(p)).not.toThrow();
  });

  it("resolves muStar from star.m fallback", () => {
    const p = withNbody(baseParams());
    const nbody = (p.dynamics as any).nbodyPlanetMoon;
    delete nbody.muStar;
    expect(() => assertDynamicsInputs(p)).not.toThrow();
  });

  it("throws when muPlanet cannot be resolved", () => {
    const p = withNbody(baseParams());
    const nbody = (p.dynamics as any).nbodyPlanetMoon;
    delete nbody.muPlanet;
    delete (p.planet as any).m;
    expect(() => assertDynamicsInputs(p)).toThrow(/muPlanet/i);
  });

  it("throws when muMoon cannot be resolved", () => {
    const p = withNbody(baseParams());
    const nbody = (p.dynamics as any).nbodyPlanetMoon;
    delete nbody.muMoon;
    delete (p as any).moon.m;
    expect(() => assertDynamicsInputs(p)).toThrow(/muMoon/i);
  });

  it("throws when dtMax is not positive", () => {
    const p = withNbody(baseParams());
    (p.dynamics as any).nbodyPlanetMoon.dtMax = 0;
    expect(() => assertDynamicsInputs(p)).toThrow(/dtMax/i);
  });

  it("throws when softening is negative", () => {
    const p = withNbody(baseParams());
    (p.dynamics as any).nbodyPlanetMoon.softening = -1;
    expect(() => assertDynamicsInputs(p)).toThrow(/softening/i);
  });

  it("accepts zero softening", () => {
    const p = withNbody(baseParams());
    (p.dynamics as any).nbodyPlanetMoon.softening = 0;
    expect(() => assertDynamicsInputs(p)).not.toThrow();
  });

  it("throws for perturber with invalid mu", () => {
    const p = withNbody(baseParams());
    (p.dynamics as any).nbodyPlanetMoon.perturbers = [
      { enabled: true, mu: -1, orbit: { a: 1e12, e: 0, inc: 0, Omega: 0, omega: 0, period: 1e8, t0: 0 } },
    ];
    expect(() => assertDynamicsInputs(p)).toThrow(/perturbers\[0\]/i);
  });

  it("throws for perturber without orbit", () => {
    const p = withNbody(baseParams());
    (p.dynamics as any).nbodyPlanetMoon.perturbers = [{ enabled: true, mu: 1e15 }];
    expect(() => assertDynamicsInputs(p)).toThrow(/orbit/i);
  });

  it("throws for perturber with function orbit", () => {
    const p = withNbody(baseParams());
    (p.dynamics as any).nbodyPlanetMoon.perturbers = [{ enabled: true, mu: 1e15, orbit: () => ({}) }];
    expect(() => assertDynamicsInputs(p)).toThrow(/perturbers.*static/i);
  });

  it("skips disabled perturbers", () => {
    const p = withNbody(baseParams());
    (p.dynamics as any).nbodyPlanetMoon.perturbers = [{ enabled: false, mu: -99 }];
    expect(() => assertDynamicsInputs(p)).not.toThrow();
  });
});

describe("assertDynamicsInputs: integrator validation", () => {
  it("throws for invalid integrator.mode", () => {
    const p = baseParams();
    (p as any).dynamics = { integrator: { mode: "runge-kutta" } };
    expect(() => assertDynamicsInputs(p)).toThrow(/mode/i);
  });

  it("accepts fixed-verlet mode", () => {
    const p = baseParams();
    (p as any).dynamics = { integrator: { mode: "fixed-verlet" } };
    expect(() => assertDynamicsInputs(p)).not.toThrow();
  });

  it("throws for non-positive errorTolAbs", () => {
    const p = baseParams();
    (p as any).dynamics = { integrator: { errorTolAbs: 0 } };
    expect(() => assertDynamicsInputs(p)).toThrow(/errorTolAbs/i);
  });

  it("throws for non-positive dtMin", () => {
    const p = baseParams();
    (p as any).dynamics = { integrator: { dtMin: -1 } };
    expect(() => assertDynamicsInputs(p)).toThrow(/dtMin/i);
  });

  it("throws for maxSubsteps < 1", () => {
    const p = baseParams();
    (p as any).dynamics = { integrator: { maxSubsteps: 0 } };
    expect(() => assertDynamicsInputs(p)).toThrow(/maxSubsteps/i);
  });

  it("throws for invalid fidelityProfile", () => {
    const p = baseParams();
    (p as any).dynamics = { fidelityProfile: "ultra-fast" };
    expect(() => assertDynamicsInputs(p)).toThrow(/fidelityProfile/i);
  });

  it("throws for invalid relativityLevel", () => {
    const p = baseParams();
    (p as any).dynamics = { relativityLevel: "newtonian" };
    expect(() => assertDynamicsInputs(p)).toThrow(/relativityLevel/i);
  });

  it("throws for invalid collisionPolicy.minSeparation", () => {
    const p = baseParams();
    (p as any).dynamics = { collisionPolicy: { minSeparation: -1 } };
    expect(() => assertDynamicsInputs(p)).toThrow(/minSeparation/i);
  });

  it("throws for invalid collisionPolicy.onCloseEncounter", () => {
    const p = baseParams();
    (p as any).dynamics = { collisionPolicy: { onCloseEncounter: "ignore" } };
    expect(() => assertDynamicsInputs(p)).toThrow(/onCloseEncounter/i);
  });
});

describe("assertDynamicsInputs: relativity validation", () => {
  function withRelativity(params: SystemParams): SystemParams {
    return {
      ...params,
      dynamics: {
        relativity: { enabled: true, c: 3e8 },
      } as any,
    };
  }

  it("passes for valid relativity config", () => {
    expect(() => assertDynamicsInputs(withRelativity(baseParams()))).not.toThrow();
  });

  it("throws when ltte enabled but c is not positive", () => {
    const p = withRelativity(baseParams());
    (p.dynamics as any).relativity.c = 0;
    expect(() => assertDynamicsInputs(p)).toThrow(/relativity\.c/i);
  });

  it("throws for non-integer ltteIters", () => {
    const p = withRelativity(baseParams());
    (p.dynamics as any).relativity.ltteIters = 0;
    expect(() => assertDynamicsInputs(p)).toThrow(/ltteIters/i);
  });

  it("throws for negative ltteTolSec", () => {
    const p = withRelativity(baseParams());
    (p.dynamics as any).relativity.ltteTolSec = -1;
    expect(() => assertDynamicsInputs(p)).toThrow(/ltteTolSec/i);
  });

  it("throws for NaN planetPrecessionPerOrbit", () => {
    const p = withRelativity(baseParams());
    (p.dynamics as any).relativity.planetPrecessionPerOrbit = NaN;
    expect(() => assertDynamicsInputs(p)).toThrow(/planetPrecessionPerOrbit/i);
  });

  it("throws for NaN moonPrecessionPerOrbit", () => {
    const p = withRelativity(baseParams());
    (p.dynamics as any).relativity.moonPrecessionPerOrbit = NaN;
    expect(() => assertDynamicsInputs(p)).toThrow(/moonPrecessionPerOrbit/i);
  });

  it("throws for negative shapiroMinImpact", () => {
    const p = withRelativity(baseParams());
    (p.dynamics as any).relativity.shapiroMinImpact = -1;
    expect(() => assertDynamicsInputs(p)).toThrow(/shapiroMinImpact/i);
  });

  it("throws for NaN timingRefSec", () => {
    const p = withRelativity(baseParams());
    (p.dynamics as any).relativity.timingRefSec = NaN;
    expect(() => assertDynamicsInputs(p)).toThrow(/timingRefSec/i);
  });

  it("skips ltte checks when ltte is false", () => {
    const p = withRelativity(baseParams());
    (p.dynamics as any).relativity.ltte = false;
    (p.dynamics as any).relativity.c = 0; // would fail if ltte was active
    expect(() => assertDynamicsInputs(p)).not.toThrow();
  });

  it("skips grPrecession checks when grPrecession is false", () => {
    const p = withRelativity(baseParams());
    (p.dynamics as any).relativity.grPrecession = false;
    (p.dynamics as any).relativity.planetPrecessionPerOrbit = NaN; // would fail if gr was active
    expect(() => assertDynamicsInputs(p)).not.toThrow();
  });
});

describe("assertDynamicsInputs: timekeeping validation", () => {
  function withTimekeeping(params: SystemParams): SystemParams {
    return {
      ...params,
      observer: { timekeeping: { enabled: true } } as any,
    };
  }

  it("passes for minimal timekeeping config", () => {
    expect(() => assertDynamicsInputs(withTimekeeping(baseParams()))).not.toThrow();
  });

  it("throws for NaN barycentricOffsetSec", () => {
    const p = withTimekeeping(baseParams());
    (p as any).observer.timekeeping.barycentricOffsetSec = NaN;
    expect(() => assertDynamicsInputs(p)).toThrow(/barycentricOffsetSec/i);
  });

  it("throws for NaN periodicErrorAmpSec", () => {
    const p = withTimekeeping(baseParams());
    (p as any).observer.timekeeping.periodicErrorAmpSec = NaN;
    expect(() => assertDynamicsInputs(p)).toThrow(/periodicErrorAmpSec/i);
  });

  it("throws for non-positive periodSec", () => {
    const p = withTimekeeping(baseParams());
    (p as any).observer.timekeeping.periodSec = 0;
    expect(() => assertDynamicsInputs(p)).toThrow(/periodSec/i);
  });

  it("throws for NaN phaseSec", () => {
    const p = withTimekeeping(baseParams());
    (p as any).observer.timekeeping.phaseSec = NaN;
    expect(() => assertDynamicsInputs(p)).toThrow(/phaseSec/i);
  });
});
