// src/sim/validation/assertions.ts
//
// Centralized validation helpers (ported from the original monolithic sim.ts).
// Keep these checks strict and early to preserve “fail fast” behavior.

import type { OrbitElements, OrbitElementsProvider, SystemParams } from "../../core/types";
import { isFiniteNonNegative, isFinitePositive } from "../../core/units";
import { assertDynamicsInputs } from "./assertDynamics";
import { assertPhotometryInputs } from "./assertPhotometry";

function assertBodyRadius(r: unknown, name: string): void {
  if (!isFinitePositive(r)) throw new Error(`${name}.r must be > 0 and finite`);
}

function assertOptionalMass(m: unknown, name: string): void {
  // Mass is optional; if present it must be finite and >= 0 (0 disables barycentric effects cleanly).
  if (m === undefined) return;
  if (!isFiniteNonNegative(m)) throw new Error(`${name}.m must be finite and >= 0 if provided`);
}

function assertOblateness(shape: { oblateness?: number } | undefined, name: string): void {
  if (!shape) return;
  const f = shape.oblateness;
  if (f === undefined) return;
  if (!Number.isFinite(f) || f < 0 || f >= 1) {
    throw new Error(`${name}.shape.oblateness must be in [0,1).`);
  }
}

function assertRings(
  rings:
    | { innerRadius: number; outerRadius: number; inclination?: number; positionAngle?: number }
    | undefined,
  name: string,
): void {
  if (!rings) return;
  const inner = rings.innerRadius;
  const outer = rings.outerRadius;
  if (!Number.isFinite(inner) || inner < 0) {
    throw new Error(`${name}.rings.innerRadius must be finite and >= 0.`);
  }
  if (!Number.isFinite(outer) || outer <= inner) {
    throw new Error(`${name}.rings.outerRadius must be finite and > innerRadius.`);
  }
  if (rings.inclination !== undefined && !Number.isFinite(rings.inclination)) {
    throw new Error(`${name}.rings.inclination must be finite if provided.`);
  }
  if (rings.positionAngle !== undefined && !Number.isFinite(rings.positionAngle)) {
    throw new Error(`${name}.rings.positionAngle must be finite if provided.`);
  }
}

function assertBodyAdvanced(
  body:
    | {
        spin?: { rotationPeriodSec?: number; obliquity?: number; axisPositionAngle?: number };
        gravityHarmonics?: { J2?: number };
        tides?: { enabled?: boolean; k2?: number; Q?: number; daDt?: number; deDt?: number };
      }
    | undefined,
  name: string,
): void {
  if (!body) return;
  const spin = body.spin;
  if (spin) {
    if (
      spin.rotationPeriodSec !== undefined &&
      (!Number.isFinite(spin.rotationPeriodSec) || spin.rotationPeriodSec <= 0)
    ) {
      throw new Error(`${name}.spin.rotationPeriodSec must be finite and > 0 if provided.`);
    }
    if (
      spin.obliquity !== undefined &&
      (!Number.isFinite(spin.obliquity) || spin.obliquity < 0 || spin.obliquity > Math.PI)
    ) {
      throw new Error(`${name}.spin.obliquity must be in [0,pi] if provided.`);
    }
    if (spin.axisPositionAngle !== undefined && !Number.isFinite(spin.axisPositionAngle)) {
      throw new Error(`${name}.spin.axisPositionAngle must be finite if provided.`);
    }
  }

  const gh = body.gravityHarmonics;
  if (gh?.J2 !== undefined && (!Number.isFinite(gh.J2) || gh.J2 < 0 || gh.J2 > 1)) {
    throw new Error(`${name}.gravityHarmonics.J2 must be finite and in [0,1] if provided.`);
  }

  const tides = body.tides;
  if (tides?.enabled) {
    if (tides.k2 !== undefined && (!Number.isFinite(tides.k2) || tides.k2 < 0)) {
      throw new Error(`${name}.tides.k2 must be finite and >= 0 if provided.`);
    }
    if (tides.Q !== undefined && (!Number.isFinite(tides.Q) || tides.Q <= 0)) {
      throw new Error(`${name}.tides.Q must be finite and > 0 if provided.`);
    }
    if (tides.daDt !== undefined && !Number.isFinite(tides.daDt)) {
      throw new Error(`${name}.tides.daDt must be finite if provided.`);
    }
    if (tides.deDt !== undefined && !Number.isFinite(tides.deDt)) {
      throw new Error(`${name}.tides.deDt must be finite if provided.`);
    }
  }
}

export function assertOrbit(el: OrbitElements, name: string): void {
  if (!el || typeof el !== "object") throw new Error(`${name} must be an object.`);
  if (!Number.isFinite(el.a) || el.a <= 0) throw new Error(`${name}.a must be > 0`);
  if (!Number.isFinite(el.e) || el.e < 0 || el.e >= 1) throw new Error(`${name}.e must be in [0, 1)`);
  if (!Number.isFinite(el.period) || el.period <= 0) throw new Error(`${name}.period must be > 0`);

  // Angles and epoch must be finite (angles are radians by project convention).
  if (!Number.isFinite(el.inc)) throw new Error(`${name}.inc must be finite`);
  if (el.inc < 0 || el.inc > Math.PI) {
    throw new Error(`${name}.inc must be in [0, pi] radians.`);
  }
  if (!Number.isFinite(el.Omega)) throw new Error(`${name}.Omega must be finite`);
  if (!Number.isFinite(el.omega)) throw new Error(`${name}.omega must be finite`);
  if (!Number.isFinite(el.t0)) throw new Error(`${name}.t0 must be finite`);
}

export function assertOrbitProvider(elOrProvider: OrbitElements | OrbitElementsProvider, name: string): void {
  // Provider itself can’t be fully validated without a time; validate “static” object immediately.
  if (typeof elOrProvider !== "function") assertOrbit(elOrProvider, name);
}

/**
 * Mirrors the top-of-step validation from the original sim.ts stepSystem().
 * Additionally validates key orbital inputs so downstream physics never sees invalid elements.
 */
export function assertStepInputs(params: SystemParams, t: number): void {
  if (!params.star || !params.planet) throw new Error("stepSystem: missing star/planet params.");
  if (!Number.isFinite(t)) throw new Error("stepSystem: t must be finite.");

  // Body radii are mandatory for geometry + photometry.
  assertBodyRadius(params.star.r, "star");
  assertBodyRadius(params.planet.r, "planet");
  if (params.moon) assertBodyRadius(params.moon.r, "moon");

  // Masses are optional but must be sane if provided (used for barycenter split / diagnostics).
  assertOptionalMass(params.star.m, "star");
  assertOptionalMass(params.planet.m, "planet");
  if (params.moon) assertOptionalMass(params.moon.m, "moon");

  // Optional shape/ring parameters.
  assertOblateness(params.planet.shape, "planet");
  assertRings(params.planet.rings, "planet");
  assertBodyAdvanced(params.planet, "planet");
  if (params.moon) {
    assertOblateness(params.moon.shape, "moon");
    assertRings(params.moon.rings, "moon");
    assertBodyAdvanced(params.moon, "moon");
  }
  assertBodyAdvanced(params.star, "star");

  // Orbits must be present and valid (static or provider).
  if (!params.planet.orbit) throw new Error("planet.orbit must be provided.");
  assertOrbitProvider(params.planet.orbit, "planet.orbit");

  if (params.moon) {
    if (!params.moon.orbitAroundPlanet)
      throw new Error("moon.orbitAroundPlanet must be provided when moon exists.");
    assertOrbitProvider(params.moon.orbitAroundPlanet, "moon.orbitAroundPlanet");
  }

  assertDynamicsInputs(params);
  assertPhotometryInputs(params);
}
