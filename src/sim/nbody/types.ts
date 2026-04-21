import type { OrbitElements } from "../../core/types";
import type { Vec3 } from "../../physics/vec3";

export type NBodyPerturberState = {
  r: Vec3;
  v: Vec3;
};

export type NBodyState = {
  t: number;
  rS: Vec3;
  vS: Vec3;
  rP: Vec3;
  vP: Vec3;
  rM: Vec3;
  vM: Vec3;
  perturbers: NBodyPerturberState[];
};

export type NBodyPerturberResolved = {
  mu: number;
  orbit: OrbitElements;
};

export type ResolvedNBodyConfig = {
  muStar: number;
  muPlanet: number;
  muMoon: number;
  dtMaxAbs: number;
  softening: number;
  throwOnOverlap: boolean;
  perturbers: NBodyPerturberResolved[];
  relativity: { grOn: boolean; c: number };
  integrator: {
    mode: "fixed-verlet" | "adaptive-verlet";
    errorTolAbs: number;
    dtMin: number;
    growthFactor: number;
    shrinkFactor: number;
    maxSubsteps: number;
  };
  collision: {
    enabled: boolean;
    minSeparation: number;
    onCloseEncounter: "warn" | "abort";
  };
};

export type NBodyCacheEntry = {
  t: number;
  state: NBodyState;
  /** Timestamp of last access (for LRU eviction). */
  lastAccess?: number;
};

export type NBodyConservationDiagnostics = {
  energy: number;
  angularMomentum: number;
};

export const ANCHOR_TIME_SEC = 0;
export const NBODY_CACHE_MAX = 24;
