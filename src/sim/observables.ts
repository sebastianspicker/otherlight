/**
 * Owns observables support within the sim layer. Keeps simulation state and numerical execution separate from UI coordination.
 */
import type { BodyKinematics } from "./kinematics";
import type { StepObservables, SystemParams } from "../core/types";
import { normalizeRelativityParams } from "../physics/relativity";
import { getNBodyConservationAt, isNBodyEnabled } from "./dynamics";
import { radialVelocityFromState, sampleSystemState } from "./stateSampler";
import type { Vec3 } from "../physics/vec3";
import { isPhysicsFeatureEnabled } from "./fidelity";

export function computeStepObservables(
  params: SystemParams,
  t: number,
  observerDir: Vec3,
  kin: BodyKinematics,
): StepObservables | undefined {
  if (!isPhysicsFeatureEnabled(params, "observables")) return undefined;

  const sampled = sampleSystemState({
    system: params,
    tObs: t,
    observerDir,
    kinAtT: kin,
    velDtSec: params.dynamics?.exomoonTimingShape?.velDt,
  });

  const rel = normalizeRelativityParams(params.dynamics?.relativity);

  const obs: StepObservables = {
    rvStar: radialVelocityFromState(sampled.star.v, observerDir),
    rvPlanet: radialVelocityFromState(sampled.planet.v, observerDir),
    rvMoon: sampled.moon ? radialVelocityFromState(sampled.moon.v, observerDir) : undefined,
    astrometricOffsetStar: {
      x: sampled.star.sky.x,
      y: sampled.star.sky.y,
    },
    timing: {
      lttePlanetSec: sampled.planet.ltteSec,
      ltteMoonSec: sampled.moon?.ltteSec,
      shapiroPlanetSec: sampled.planet.shapiroSec,
      shapiroMoonSec: sampled.moon?.shapiroSec,
    },
  };

  if (isNBodyEnabled(params)) {
    const cons = getNBodyConservationAt(params, t);
    if (cons) {
      obs.conservation = {
        energy: cons.energy,
        angularMomentum: cons.angularMomentum,
      };
    }
  }

  if (!rel.enabled) {
    if (obs.timing) {
      obs.timing.lttePlanetSec = undefined;
      obs.timing.ltteMoonSec = undefined;
      obs.timing.shapiroPlanetSec = undefined;
      obs.timing.shapiroMoonSec = undefined;
    }
  }

  return obs;
}
