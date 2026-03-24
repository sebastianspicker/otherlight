// src/sim/orbits.ts
//
// Small utilities for working with Keplerian orbital elements.
//
// Scientific conventions (must match src/core/types.ts and src/physics/*):
// - Time t, period, t0 are in seconds.
// - Angles are in radians.
// - Elliptic elements require e in [0, 1).
// - Position mapping uses the active-rotation convention implemented by perifocalToInertial:
//   r_IJK = Rz(Omega) * Rx(inc) * Rz(omega) * r_PQW.

import type { OrbitElements, OrbitElementsProvider } from "../core/types";
import type { Vec3 } from "../physics/vec3";
import { radiusFromE, solveKeplerE, trueAnomalyFromE } from "../physics/kepler";
import { perifocalToInertial } from "../physics/frames";
import { assertOrbit } from "./validation";
export function resolveOrbitElements(
  elOrProvider: OrbitElements | OrbitElementsProvider,
  t: number,
  nameForErrors: string,
): OrbitElements {
  if (!Number.isFinite(t)) throw new Error(`${nameForErrors}: t must be finite.`);
  const el = typeof elOrProvider === "function" ? elOrProvider(t) : elOrProvider;
  assertOrbit(el, nameForErrors);
  return el;
}

export function posFromResolvedElements(el: OrbitElements, t: number, nameForErrors = "orbit"): Vec3 {
  if (!Number.isFinite(t)) throw new Error(`${nameForErrors}: t must be finite.`);
  assertOrbit(el, nameForErrors);

  // Mean motion n = 2π / P [rad/s]
  const n = (2 * Math.PI) / el.period;

  // Mean anomaly M(t) = n (t - t0), where t0 is the time of periapsis passage.
  // solveKeplerE should internally handle wrapping of M for numerical stability.
  const M = n * (t - el.t0);

  // Kepler solve (elliptic).
  const E = solveKeplerE(M, el.e);

  // True anomaly ν and radius r.
  const nu = trueAnomalyFromE(E, el.e);
  const r = radiusFromE(el.a, el.e, E);

  // Perifocal position vector r_PQW.
  const rPQW: Vec3 = { x: r * Math.cos(nu), y: r * Math.sin(nu), z: 0 };

  // Rotate into inertial frame.
  return perifocalToInertial(rPQW, el.Omega, el.inc, el.omega);
}

export function posFromElements(
  elOrProvider: OrbitElements | OrbitElementsProvider,
  t: number,
  nameForErrors: string,
): Vec3 {
  const el = resolveOrbitElements(elOrProvider, t, nameForErrors);
  return posFromResolvedElements(el, t, nameForErrors);
}
