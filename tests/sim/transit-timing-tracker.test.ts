/** Verifies transit timing tracker contracts across system state, transit observables, and V4 integration. */

import { expect, it } from "vitest";

import { cloneParams } from "../../src/app/scenario";
import type { SystemParams } from "../../src/core/types";
import { computeBodyKinematics } from "../../src/sim/kinematics";
import { getObserverDir } from "../../src/sim/observerContract";
import { stepSystem } from "../../src/sim/sim";

type TransitBodyId = "planet" | "moon";

type ReferenceTransitEvent = {
  centerSec: number;
  durationSec: number;
  ingressSec: number;
  egressSec: number;
};

function contactValueBody(params: SystemParams, tSec: number, body: TransitBodyId): number {
  const observerDir = getObserverDir(params);
  const kin = computeBodyKinematics(params, tSec, observerDir);
  const sky = body === "planet" ? kin.planetSky : kin.moonSky;
  const rBody = body === "planet" ? params.planet.r : params.moon?.r;
  if (!sky || !(sky.z > 0) || !(Number.isFinite(rBody) && (rBody as number) > 0))
    return Number.POSITIVE_INFINITY;
  return Math.hypot(sky.x, sky.y) - (params.star.r + (rBody as number));
}

function impactSquaredBody(params: SystemParams, tSec: number, body: TransitBodyId): number {
  const observerDir = getObserverDir(params);
  const kin = computeBodyKinematics(params, tSec, observerDir);
  const sky = body === "planet" ? kin.planetSky : kin.moonSky;
  if (!sky || !(sky.z > 0)) return Number.POSITIVE_INFINITY;
  return sky.x * sky.x + sky.y * sky.y;
}

function bisectRoot(args: {
  fn: (tSec: number) => number;
  leftSec: number;
  rightSec: number;
  tolSec?: number;
  maxIters?: number;
}): number {
  let leftSec = args.leftSec;
  let rightSec = args.rightSec;
  let leftVal = args.fn(leftSec);
  const rightVal = args.fn(rightSec);
  if (!(leftVal <= 0 && rightVal >= 0) && !(leftVal >= 0 && rightVal <= 0)) {
    throw new Error("bisectRoot: bracket does not straddle a root.");
  }
  const tolSec = args.tolSec ?? 1e-9;
  const maxIters = args.maxIters ?? 80;

  for (let iter = 0; iter < maxIters && rightSec - leftSec > tolSec; iter++) {
    const midSec = (leftSec + rightSec) / 2;
    const midVal = args.fn(midSec);
    if (!Number.isFinite(midVal) || Math.abs(midVal) <= 1e-12) return midSec;
    if ((leftVal <= 0 && midVal >= 0) || (leftVal >= 0 && midVal <= 0)) {
      rightSec = midSec;
    } else {
      leftSec = midSec;
      leftVal = midVal;
    }
  }

  return (leftSec + rightSec) / 2;
}

function planetPeriodSec(params: SystemParams): number {
  const orbit = params.planet.orbit;
  if (!("period" in orbit)) {
    throw new Error(
      "buildTransitReference: planet orbit provider is not supported in this reference helper.",
    );
  }
  return orbit.period;
}

function transitBodyRadius(params: SystemParams, body: TransitBodyId): number {
  if (body === "moon" && !params.moon) {
    throw new Error("buildTransitReference: moon reference requested but moon is missing.");
  }
  return body === "planet" ? params.planet.r : params.moon!.r;
}

function findCoarseTransitCenter(args: {
  params: SystemParams;
  body: TransitBodyId;
  period: number;
  rBody: number;
  coarseSamples: number;
}): { coarseCenterSec: number; coarseStepSec: number } {
  const coarseStepSec = args.period / args.coarseSamples;
  let coarseCenterSec = 0;
  let minImpact = Number.POSITIVE_INFINITY;
  for (let idx = 0; idx <= args.coarseSamples; idx++) {
    const tSec = idx * coarseStepSec;
    const contact = contactValueBody(args.params, tSec, args.body);
    if (!(contact <= 0)) continue;
    const impact = contact + (args.params.star.r + args.rBody);
    if (impact < minImpact) {
      minImpact = impact;
      coarseCenterSec = tSec;
    }
  }

  if (!(minImpact < args.params.star.r + args.rBody)) {
    throw new Error(`buildTransitReference: no front-of-star ${args.body} transit found.`);
  }
  return { coarseCenterSec, coarseStepSec };
}

function contactBracket(args: {
  params: SystemParams;
  body: TransitBodyId;
  coarseCenterSec: number;
  coarseStepSec: number;
  period: number;
  direction: -1 | 1;
}): { leftSec: number; rightSec: number } {
  let outerSec = args.coarseCenterSec;
  const inBounds = () => (args.direction < 0 ? outerSec > 0 : outerSec < args.period);
  while (inBounds() && !(contactValueBody(args.params, outerSec, args.body) > 0)) {
    outerSec += args.direction * args.coarseStepSec;
  }
  return args.direction < 0
    ? { leftSec: outerSec, rightSec: outerSec + args.coarseStepSec }
    : { leftSec: outerSec - args.coarseStepSec, rightSec: outerSec };
}

function contactTimeSec(args: Parameters<typeof contactBracket>[0]): number {
  const bracket = contactBracket(args);
  return bisectRoot({
    fn: (tSec) => contactValueBody(args.params, tSec, args.body),
    leftSec: bracket.leftSec,
    rightSec: bracket.rightSec,
  });
}

function refineTransitCenterSec(
  params: SystemParams,
  body: TransitBodyId,
  ingressSec: number,
  egressSec: number,
): number {
  let centerLeftSec = ingressSec;
  let centerRightSec = egressSec;
  for (let iter = 0; iter < 80; iter++) {
    const spanSec = centerRightSec - centerLeftSec;
    if (!(spanSec > 1e-9)) break;
    const leftThirdSec = centerLeftSec + spanSec / 3;
    const rightThirdSec = centerRightSec - spanSec / 3;
    if (impactSquaredBody(params, leftThirdSec, body) <= impactSquaredBody(params, rightThirdSec, body)) {
      centerRightSec = rightThirdSec;
    } else {
      centerLeftSec = leftThirdSec;
    }
  }
  return (centerLeftSec + centerRightSec) / 2;
}

function buildTransitReference(params: SystemParams, body: TransitBodyId): ReferenceTransitEvent {
  const period = planetPeriodSec(params);
  const rBody = transitBodyRadius(params, body);
  const coarse = findCoarseTransitCenter({ params, body, period, rBody, coarseSamples: 8000 });
  const ingressSec = contactTimeSec({ ...coarse, params, body, period, direction: -1 });
  const egressSec = contactTimeSec({ ...coarse, params, body, period, direction: 1 });
  const centerSec = refineTransitCenterSec(params, body, ingressSec, egressSec);

  return {
    centerSec,
    durationSec: egressSec - ingressSec,
    ingressSec,
    egressSec,
  };
}

it("estimates planet transit center and duration from dynamic state", () => {
  const period = 1000;
  const params: SystemParams = {
    observer: { dir: { x: 0, y: 0, z: 1 } },
    star: { r: 1, photometry: { baselineFlux: 1, gridRes: 300 } },
    planet: {
      r: 0.1,
      orbit: {
        a: 5,
        e: 0,
        inc: Math.PI / 2,
        Omega: 0,
        omega: 0,
        period,
        t0: 0,
      },
    },
  };

  const tNearCenter = period / 4;
  const step = stepSystem(params, tNearCenter);
  const timing = step.meta?.timing;

  expect(Number.isFinite(timing?.planetTransitCenterSec)).toBe(true);
  expect(Number.isFinite(timing?.planetTransitDurationSec)).toBe(true);
  expect(Number.isFinite(timing?.planetIngressSec)).toBe(true);
  expect(Number.isFinite(timing?.planetEgressSec)).toBe(true);
  expect((timing?.planetTransitDurationSec ?? 0) > 0).toBe(true);
  expect(Math.abs((timing?.planetTransitCenterSec ?? 0) - tNearCenter)).toBeLessThan(5);
});

it("does not report a transit event when the trajectory is not in front of the star", () => {
  const period = 1000;
  const params: SystemParams = {
    observer: { dir: { x: 0, y: 0, z: 1 } },
    star: { r: 1, photometry: { baselineFlux: 1, gridRes: 300 } },
    planet: {
      r: 0.1,
      orbit: {
        a: 5,
        e: 0,
        inc: 0,
        Omega: 0,
        omega: 0,
        period,
        t0: 0,
      },
    },
  };

  const step = stepSystem(params, 0);
  const timing = step.meta?.timing;

  expect(timing?.planetTransitCenterSec).toBeUndefined();
  expect(timing?.planetTransitDurationSec).toBeUndefined();
  expect(timing?.planetIngressSec).toBeUndefined();
  expect(timing?.planetEgressSec).toBeUndefined();
});

it("matches exact eccentric planet contact times instead of relying on a tangent-chord estimate", () => {
  const params: SystemParams = {
    observer: { dir: { x: 0, y: 0, z: 1 } },
    star: { r: 1, m: 1, photometry: { baselineFlux: 1, gridRes: 300 } },
    dynamics: { fidelityProfile: "accurate" },
    planet: {
      r: 0.1,
      m: 1e-3,
      orbit: {
        a: 5,
        e: 0.6,
        inc: Math.PI / 2,
        Omega: 0,
        omega: 0.8,
        period: 1000,
        t0: 0,
      },
    },
  };

  const reference = buildTransitReference(params, "planet");
  const step = stepSystem(params, reference.centerSec);
  const timing = step.meta?.timing;
  const eventTiming = step.meta?.eventTimingConvergence?.planet;

  expect(timing?.planetIngressSec).toBeCloseTo(reference.ingressSec, 3);
  expect(timing?.planetEgressSec).toBeCloseTo(reference.egressSec, 3);
  expect(timing?.planetTransitDurationSec).toBeCloseTo(reference.durationSec, 3);
  expect(timing?.planetTransitCenterSec).toBeCloseTo(reference.centerSec, 3);
  expect(eventTiming?.status).toBe("exact");
  expect(eventTiming?.converged).toBe(true);
  expect(eventTiming?.usedExact).toBe(true);
});

it("invalidates exact transit reference epochs when orbit geometry changes on the same params object", () => {
  const params: SystemParams = {
    observer: { dir: { x: 0, y: 0, z: 1 } },
    star: { r: 1, m: 1, photometry: { baselineFlux: 1, gridRes: 300 } },
    dynamics: { fidelityProfile: "accurate" },
    planet: {
      r: 0.1,
      m: 1e-3,
      orbit: {
        a: 5,
        e: 0.6,
        inc: Math.PI / 2,
        Omega: 0,
        omega: 0.2,
        period: 1000,
        t0: 0,
      },
    },
  };

  void stepSystem(params, 0);
  if (!("omega" in params.planet.orbit)) throw new Error("expected static planet orbit");
  params.planet.orbit.omega = 0.8;

  const reused = stepSystem(params, 0).meta?.timing;
  const fresh = stepSystem(cloneParams(params), 0).meta?.timing;

  expect(reused?.planetTransitCenterSec).toBeCloseTo(fresh?.planetTransitCenterSec ?? 0, 8);
  expect(reused?.planetTtvSec).toBeCloseTo(fresh?.planetTtvSec ?? 0, 8);
});

it("matches exact moon contact times on the higher-fidelity path", () => {
  const params: SystemParams = {
    observer: { dir: { x: 0, y: 0, z: 1 } },
    star: {
      r: 1,
      m: 1,
      photometry: { baselineFlux: 1, gridRes: 300, additiveComposition: "higher-fidelity-coupled" },
    },
    dynamics: { fidelityProfile: "accurate" },
    planet: {
      r: 0.09,
      m: 1e-3,
      orbit: {
        a: 5,
        e: 0.2,
        inc: Math.PI / 2,
        Omega: 0,
        omega: 0.2,
        period: 1000,
        t0: 0,
      },
    },
    moon: {
      r: 0.03,
      m: 1e-5,
      orbitAroundPlanet: {
        a: 0.55,
        e: 0.05,
        inc: 0.03,
        Omega: 0.15,
        omega: 0.4,
        period: 180,
        t0: 0,
      },
    },
  };

  const reference = buildTransitReference(params, "moon");
  const step = stepSystem(params, reference.centerSec);
  const timing = step.meta?.timing;
  const eventTiming = step.meta?.eventTimingConvergence?.moon;

  expect(timing?.moonIngressSec).toBeCloseTo(reference.ingressSec, 3);
  expect(timing?.moonEgressSec).toBeCloseTo(reference.egressSec, 3);
  expect(timing?.moonTransitDurationSec).toBeCloseTo(reference.durationSec, 3);
  expect(timing?.moonTransitCenterSec).toBeCloseTo(reference.centerSec, 3);
  expect(eventTiming?.status).toBe("exact");
  expect(eventTiming?.converged).toBe(true);
  expect(eventTiming?.usedExact).toBe(true);
});

it("matches exact grazing planet contact times on the higher-fidelity path", () => {
  const params: SystemParams = {
    observer: { dir: { x: 0, y: 0, z: 1 } },
    star: { r: 1, m: 1, photometry: { baselineFlux: 1, gridRes: 300 } },
    dynamics: { fidelityProfile: "accurate" },
    planet: {
      r: 0.1,
      m: 1e-3,
      orbit: {
        a: 5,
        e: 0,
        inc: Math.acos(1.095 / 5),
        Omega: 0,
        omega: 0,
        period: 1000,
        t0: 0,
      },
    },
  };

  const reference = buildTransitReference(params, "planet");
  const step = stepSystem(params, reference.centerSec);
  const timing = step.meta?.timing;
  const eventTiming = step.meta?.eventTimingConvergence?.planet;

  expect(timing?.planetIngressSec).toBeCloseTo(reference.ingressSec, 3);
  expect(timing?.planetEgressSec).toBeCloseTo(reference.egressSec, 3);
  expect(timing?.planetTransitDurationSec).toBeCloseTo(reference.durationSec, 3);
  expect(timing?.planetTransitCenterSec).toBeCloseTo(reference.centerSec, 3);
  expect(eventTiming?.status).toBe("exact");
  expect(eventTiming?.converged).toBe(true);
  expect(eventTiming?.usedExact).toBe(true);
});

it("matches exact accelerated moon contact times when timing-shape evolution is active", () => {
  const params: SystemParams = {
    observer: { dir: { x: 0, y: 0, z: 1 } },
    star: {
      r: 1,
      m: 1,
      photometry: { baselineFlux: 1, gridRes: 300, additiveComposition: "higher-fidelity-coupled" },
    },
    dynamics: {
      fidelityProfile: "accurate",
      exomoonTimingShape: {
        enabled: true,
        tRef: 0,
        velDt: 50,
        moonOmegaDot: 5e-4,
      },
    },
    planet: {
      r: 0.09,
      m: 1e-3,
      orbit: {
        a: 5,
        e: 0.2,
        inc: Math.PI / 2,
        Omega: 0,
        omega: 0.2,
        period: 1000,
        t0: 0,
      },
    },
    moon: {
      r: 0.03,
      m: 1e-5,
      orbitAroundPlanet: {
        a: 0.55,
        e: 0.05,
        inc: 0.03,
        Omega: 0.15,
        omega: 0.4,
        period: 180,
        t0: 0,
      },
    },
  };

  const reference = buildTransitReference(params, "moon");
  const step = stepSystem(params, reference.centerSec);
  const timing = step.meta?.timing;
  const eventTiming = step.meta?.eventTimingConvergence?.moon;

  expect(timing?.moonIngressSec).toBeCloseTo(reference.ingressSec, 3);
  expect(timing?.moonEgressSec).toBeCloseTo(reference.egressSec, 3);
  expect(timing?.moonTransitDurationSec).toBeCloseTo(reference.durationSec, 3);
  expect(timing?.moonTransitCenterSec).toBeCloseTo(reference.centerSec, 3);
  expect(eventTiming?.status).toBe("exact");
  expect(eventTiming?.converged).toBe(true);
  expect(eventTiming?.usedExact).toBe(true);
});
