// src/sim/validation.ts
//
// Centralized validation helpers (ported from the original monolithic sim.ts).
// Keep these checks strict and early to preserve “fail fast” behavior.

import type { OrbitElements, OrbitElementsProvider, SystemParams } from "../core/types";

function isFiniteNonNegative(x: unknown): x is number {
  return typeof x === "number" && Number.isFinite(x) && x >= 0;
}

function isFinitePositive(x: unknown): x is number {
  return typeof x === "number" && Number.isFinite(x) && x > 0;
}

function assertBodyRadius(r: unknown, name: string): void {
  if (!isFinitePositive(r)) throw new Error(`${name}.r must be > 0 and finite`);
}

function assertOptionalMass(m: unknown, name: string): void {
  // Mass is optional; if present it must be finite and >= 0 (0 disables barycentric effects cleanly).
  if (m === undefined) return;
  if (!isFiniteNonNegative(m)) throw new Error(`${name}.m must be finite and >= 0 if provided`);
}

export function assertOrbit(el: OrbitElements, name: string): void {
  if (!Number.isFinite(el.a) || el.a <= 0) throw new Error(`${name}.a must be > 0`);
  if (!Number.isFinite(el.e) || el.e < 0 || el.e >= 1) throw new Error(`${name}.e must be in [0, 1)`);
  if (!Number.isFinite(el.period) || el.period <= 0) throw new Error(`${name}.period must be > 0`);

  // Angles and epoch must be finite (angles are radians by project convention).
  if (!Number.isFinite(el.inc)) throw new Error(`${name}.inc must be finite`);
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

  // Orbits must be present and valid (static or provider).
  if (!params.planet.orbit) throw new Error("planet.orbit must be provided.");
  assertOrbitProvider(params.planet.orbit, "planet.orbit");

  if (params.moon) {
    if (!params.moon.orbitAroundPlanet) throw new Error("moon.orbitAroundPlanet must be provided when moon exists.");
    assertOrbitProvider(params.moon.orbitAroundPlanet, "moon.orbitAroundPlanet");
  }

  // Optional photometry numeric knobs: if present, must be finite (downstream clamps as needed).
  const gridRes = params.star.photometry?.gridRes;
  if (gridRes !== undefined && !Number.isFinite(gridRes)) {
    throw new Error("star.photometry.gridRes must be finite if provided.");
  }

  const baselineFlux = params.star.photometry?.baselineFlux;
  if (baselineFlux !== undefined && !Number.isFinite(baselineFlux)) {
    throw new Error("star.photometry.baselineFlux must be finite if provided.");
  }
}
