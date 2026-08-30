/** Orbit assertion primitives shared by general and dynamics validation. */
import type { OrbitElements, OrbitElementsProvider } from "../../model/types";

const assertOrbitObject = (el: OrbitElements, name: string): void => {
  if (!el || typeof el !== "object") throw new Error(`${name} must be an object.`);
};

const assertOrbitScaleAndShape = (el: OrbitElements, name: string): void => {
  if (!Number.isFinite(el.a) || el.a <= 0) throw new Error(`${name}.a must be > 0`);
  if (!Number.isFinite(el.e) || el.e < 0 || el.e >= 1) throw new Error(`${name}.e must be in [0, 1)`);
  if (!Number.isFinite(el.period) || el.period <= 0) throw new Error(`${name}.period must be > 0`);
};

const assertOrbitAngles = (el: OrbitElements, name: string): void => {
  if (!Number.isFinite(el.inc)) throw new Error(`${name}.inc must be finite`);
  if (el.inc < 0 || el.inc > Math.PI) {
    throw new Error(`${name}.inc must be in [0, pi] radians.`);
  }
  if (!Number.isFinite(el.Omega)) throw new Error(`${name}.Omega must be finite`);
  if (!Number.isFinite(el.omega)) throw new Error(`${name}.omega must be finite`);
};

const assertOrbitEpoch = (el: OrbitElements, name: string): void => {
  if (!Number.isFinite(el.t0)) throw new Error(`${name}.t0 must be finite`);
};

export function assertOrbit(el: OrbitElements, name: string): void {
  assertOrbitObject(el, name);
  assertOrbitScaleAndShape(el, name);
  assertOrbitAngles(el, name);
  assertOrbitEpoch(el, name);
}

export function assertOrbitProvider(elOrProvider: OrbitElements | OrbitElementsProvider, name: string): void {
  if (typeof elOrProvider !== "function") assertOrbit(elOrProvider, name);
}
