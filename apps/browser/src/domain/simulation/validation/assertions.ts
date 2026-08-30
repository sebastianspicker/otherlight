/** Provides strict simulation assertions that fail invalid internal contracts early. */
//
// Centralized validation helpers (ported from the original monolithic sim.ts).
// Keep these checks strict and early to preserve "fail fast" behavior.

import type {
  Body,
  BodyGravityHarmonicsParams,
  BodySpinParams,
  BodyTidesParams,
  RingSystemParams,
  BrowserScenarioDraft,
} from "../../model/types";
import { isFiniteNonNegative, isFinitePositive } from "../../model/units";
import { assertDynamicsInputs } from "./assertDynamics";
import { assertOrbitProvider } from "./assertOrbit";
import { assertPhotometryInputs } from "./assertPhotometry";

export { assertOrbit, assertOrbitProvider } from "./assertOrbit";

const assertBodyRadius = (r: unknown, name: string): void => {
  if (!isFinitePositive(r)) throw new Error(`${name}.r must be > 0 and finite`);
};

const assertOptionalMass = (m: unknown, name: string): void => {
  // Mass is optional; if present it must be finite and >= 0 (0 disables barycentric effects cleanly).
  if (m === undefined) return;
  if (!isFiniteNonNegative(m)) throw new Error(`${name}.m must be finite and >= 0 if provided`);
};

const assertOblateness = (shape: { oblateness?: number } | undefined, name: string): void => {
  if (!shape) return;
  const f = shape.oblateness;
  if (f === undefined) return;
  if (!Number.isFinite(f) || f < 0 || f >= 1) {
    throw new Error(`${name}.shape.oblateness must be in [0,1).`);
  }
};

const assertRingRadii = (rings: RingSystemParams, name: string): void => {
  const inner = rings.innerRadius;
  const outer = rings.outerRadius;
  if (!Number.isFinite(inner) || inner < 0) {
    throw new Error(`${name}.rings.innerRadius must be finite and >= 0.`);
  }
  if (!Number.isFinite(outer) || outer <= inner) {
    throw new Error(`${name}.rings.outerRadius must be finite and > innerRadius.`);
  }
};

const assertRingOrientation = (rings: RingSystemParams, name: string): void => {
  if (rings.inclination !== undefined && !Number.isFinite(rings.inclination)) {
    throw new Error(`${name}.rings.inclination must be finite if provided.`);
  }
  if (rings.positionAngle !== undefined && !Number.isFinite(rings.positionAngle)) {
    throw new Error(`${name}.rings.positionAngle must be finite if provided.`);
  }
};

const assertRings = (rings: RingSystemParams | undefined, name: string): void => {
  if (!rings) return;
  assertRingRadii(rings, name);
  assertRingOrientation(rings, name);
};

const assertSpinPeriod = (spin: BodySpinParams, name: string): void => {
  if (
    spin.rotationPeriodSec !== undefined &&
    (!Number.isFinite(spin.rotationPeriodSec) || spin.rotationPeriodSec <= 0)
  ) {
    throw new Error(`${name}.spin.rotationPeriodSec must be finite and > 0 if provided.`);
  }
};

const assertSpinOrientation = (spin: BodySpinParams, name: string): void => {
  if (
    spin.obliquity !== undefined &&
    (!Number.isFinite(spin.obliquity) || spin.obliquity < 0 || spin.obliquity > Math.PI)
  ) {
    throw new Error(`${name}.spin.obliquity must be in [0,pi] if provided.`);
  }
  if (spin.axisPositionAngle !== undefined && !Number.isFinite(spin.axisPositionAngle)) {
    throw new Error(`${name}.spin.axisPositionAngle must be finite if provided.`);
  }
};

const assertSpin = (spin: BodySpinParams | undefined, name: string): void => {
  if (!spin) return;
  assertSpinPeriod(spin, name);
  assertSpinOrientation(spin, name);
};

const assertGravityHarmonics = (gh: BodyGravityHarmonicsParams | undefined, name: string): void => {
  if (gh?.J2 !== undefined && (!Number.isFinite(gh.J2) || gh.J2 < 0 || gh.J2 > 1)) {
    throw new Error(`${name}.gravityHarmonics.J2 must be finite and in [0,1] if provided.`);
  }
};

const assertTideShape = (tides: BodyTidesParams, name: string): void => {
  if (tides.k2 !== undefined && (!Number.isFinite(tides.k2) || tides.k2 < 0)) {
    throw new Error(`${name}.tides.k2 must be finite and >= 0 if provided.`);
  }
  if (tides.Q !== undefined && (!Number.isFinite(tides.Q) || tides.Q <= 0)) {
    throw new Error(`${name}.tides.Q must be finite and > 0 if provided.`);
  }
};

const assertTideDrift = (tides: BodyTidesParams, name: string): void => {
  if (tides.daDt !== undefined && !Number.isFinite(tides.daDt)) {
    throw new Error(`${name}.tides.daDt must be finite if provided.`);
  }
  if (tides.deDt !== undefined && !Number.isFinite(tides.deDt)) {
    throw new Error(`${name}.tides.deDt must be finite if provided.`);
  }
};

const assertTides = (tides: BodyTidesParams | undefined, name: string): void => {
  if (!tides?.enabled) return;
  assertTideShape(tides, name);
  assertTideDrift(tides, name);
};

const assertBodyAdvanced = (body: Body | undefined, name: string): void => {
  if (!body) return;
  assertSpin(body.spin, name);
  assertGravityHarmonics(body.gravityHarmonics, name);
  assertTides(body.tides, name);
};

const assertRequiredStepInputs = (params: BrowserScenarioDraft, t: number): void => {
  if (!params.star || !params.planet) throw new Error("simulation step: missing star/planet params.");
  if (!Number.isFinite(t)) throw new Error("simulation step: t must be finite.");
};

const assertStepBodyRadii = (params: BrowserScenarioDraft): void => {
  assertBodyRadius(params.star.r, "star");
  assertBodyRadius(params.planet.r, "planet");
  if (params.moon) assertBodyRadius(params.moon.r, "moon");
};

const assertStepBodyMasses = (params: BrowserScenarioDraft): void => {
  assertOptionalMass(params.star.m, "star");
  assertOptionalMass(params.planet.m, "planet");
  if (params.moon) assertOptionalMass(params.moon.m, "moon");
};

const assertBodyOptionalParams = (body: Body, name: string): void => {
  assertOblateness(body.shape, name);
  assertRings(body.rings, name);
  assertBodyAdvanced(body, name);
};

const assertStepBodyOptionalParams = (params: BrowserScenarioDraft): void => {
  assertBodyOptionalParams(params.planet, "planet");
  if (params.moon) assertBodyOptionalParams(params.moon, "moon");
  assertBodyAdvanced(params.star, "star");
};

const assertPlanetOrbit = (params: BrowserScenarioDraft): void => {
  if (!params.planet.orbit) throw new Error("planet.orbit must be provided.");
  assertOrbitProvider(params.planet.orbit, "planet.orbit");
};

const assertMoonOrbit = (params: BrowserScenarioDraft): void => {
  if (!params.moon) return;
  if (!params.moon.orbitAroundPlanet) {
    throw new Error("moon.orbitAroundPlanet must be provided when moon exists.");
  }
  assertOrbitProvider(params.moon.orbitAroundPlanet, "moon.orbitAroundPlanet");
};

const assertStepOrbits = (params: BrowserScenarioDraft): void => {
  assertPlanetOrbit(params);
  assertMoonOrbit(params);
};

/**
 * Mirrors the top-of-step validation from the original synchronous simulator.
 * Additionally validates key orbital inputs so downstream physics never sees invalid elements.
 */
export function assertStepInputs(params: BrowserScenarioDraft, t: number): void {
  assertRequiredStepInputs(params, t);
  assertStepBodyRadii(params);
  assertStepBodyMasses(params);
  assertStepBodyOptionalParams(params);
  assertStepOrbits(params);
  assertDynamicsInputs(params);
  assertPhotometryInputs(params);
}
