/** Audits the continuous quadratic position path used by one Verlet step. */
import type { Vec3 } from "../../physics/vec3";
import { stationaryPoints } from "./integratorCollisionStationary";
import type { Cubic } from "./integratorCollisionPolynomial";
import type { ResolvedNBodyConfig } from "./types";

const ROOT_EPSILON = 64 * Number.EPSILON;

function dot(left: Vec3, right: Vec3): number {
  return left.x * right.x + left.y * right.y + left.z * right.z;
}

function relativeVector(right: Vec3, left: Vec3): Vec3 {
  return { x: right.x - left.x, y: right.y - left.y, z: right.z - left.z };
}

function scaled(vector: Vec3, scale: number): Vec3 {
  return { x: vector.x * scale, y: vector.y * scale, z: vector.z * scale };
}

function quadraticVectorValue(constant: Vec3, linear: Vec3, quadratic: Vec3, u: number): Vec3 {
  return {
    x: constant.x + u * (linear.x + u * quadratic.x),
    y: constant.y + u * (linear.y + u * quadratic.y),
    z: constant.z + u * (linear.z + u * quadratic.z),
  };
}

function pairMinimumSquaredDistance(params: {
  position: Vec3;
  velocity: Vec3;
  acceleration: Vec3;
  dt: number;
}): number | undefined {
  const { position, dt } = params;
  const linear = scaled(params.velocity, dt);
  const quadratic = scaled(params.acceleration, 0.5 * dt * dt);
  const derivative: Cubic = [
    dot(position, linear),
    dot(linear, linear) + 2 * dot(position, quadratic),
    3 * dot(linear, quadratic),
    2 * dot(quadratic, quadratic),
  ];
  if (![position, linear, quadratic].every((vector) => Object.values(vector).every(Number.isFinite))) {
    return undefined;
  }
  if (!derivative.every(Number.isFinite)) return undefined;

  let minimum = Number.POSITIVE_INFINITY;
  for (const u of [0, 1, ...stationaryPoints(derivative)]) {
    const separation = quadraticVectorValue(position, linear, quadratic, u);
    const distanceSquared = dot(separation, separation);
    if (!Number.isFinite(distanceSquared)) return undefined;
    minimum = Math.min(minimum, distanceSquared);
  }
  return Number.isFinite(minimum) ? Math.max(0, minimum) : undefined;
}

export function minimumVerletStepSeparation(params: {
  positions: Vec3[];
  velocities: Vec3[];
  accelerations: Vec3[];
  dt: number;
}): number | undefined {
  const { positions, velocities, accelerations, dt } = params;
  if (
    !Number.isFinite(dt) ||
    positions.length !== velocities.length ||
    positions.length !== accelerations.length
  ) {
    return undefined;
  }

  let minimumSquared = Number.POSITIVE_INFINITY;
  for (let left = 0; left < positions.length; left++) {
    for (let right = left + 1; right < positions.length; right++) {
      const pairMinimum = pairMinimumSquaredDistance({
        position: relativeVector(positions[right], positions[left]),
        velocity: relativeVector(velocities[right], velocities[left]),
        acceleration: relativeVector(accelerations[right], accelerations[left]),
        dt,
      });
      if (pairMinimum === undefined) return undefined;
      minimumSquared = Math.min(minimumSquared, pairMinimum);
    }
  }
  return Number.isFinite(minimumSquared) ? Math.sqrt(minimumSquared) : undefined;
}

export function auditVerletStepCollision(params: {
  positions: Vec3[];
  velocities: Vec3[];
  accelerations: Vec3[];
  dt: number;
  cfg: ResolvedNBodyConfig;
}): number | undefined {
  const { cfg } = params;
  if (
    !cfg.collision.enabled ||
    !(Number.isFinite(cfg.collision.minSeparation) && cfg.collision.minSeparation > 0)
  ) {
    return undefined;
  }
  const minimum = minimumVerletStepSeparation(params);
  if (minimum === undefined) {
    throw new Error("nbody collisionPolicy: unable to certify continuous step separation.");
  }
  const threshold = cfg.collision.minSeparation;
  const margin = ROOT_EPSILON * Math.max(minimum, threshold, Number.MIN_VALUE);
  if (minimum <= threshold + margin && cfg.collision.onCloseEncounter === "abort") {
    throw new Error(
      `nbody collisionPolicy: swept close encounter below minSeparation (${minimum} < ${threshold}).`,
    );
  }
  return minimum;
}
