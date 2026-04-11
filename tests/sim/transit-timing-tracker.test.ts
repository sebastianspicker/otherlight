import { describe, expect, it } from "vitest";

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

function buildTransitReference(params: SystemParams, body: TransitBodyId): ReferenceTransitEvent {
  const orbit = params.planet.orbit;
  if (!("period" in orbit)) {
    throw new Error(
      "buildTransitReference: planet orbit provider is not supported in this reference helper.",
    );
  }
  const period = orbit.period;
  if (body === "moon" && !params.moon) {
    throw new Error("buildTransitReference: moon reference requested but moon is missing.");
  }
  const rBody = body === "planet" ? params.planet.r : params.moon!.r;
  const coarseSamples = 8000;
  const coarseStepSec = period / coarseSamples;

  let coarseCenterSec = 0;
  let minImpact = Number.POSITIVE_INFINITY;
  for (let idx = 0; idx <= coarseSamples; idx++) {
    const tSec = idx * coarseStepSec;
    const contact = contactValueBody(params, tSec, body);
    if (!(contact <= 0)) continue;
    const impact = contact + (params.star.r + rBody);
    if (impact < minImpact) {
      minImpact = impact;
      coarseCenterSec = tSec;
    }
  }

  if (!(minImpact < params.star.r + rBody)) {
    throw new Error(`buildTransitReference: no front-of-star ${body} transit found.`);
  }

  let ingressOuterSec = coarseCenterSec;
  while (ingressOuterSec > 0 && !(contactValueBody(params, ingressOuterSec, body) > 0)) {
    ingressOuterSec -= coarseStepSec;
  }
  const ingressSec = bisectRoot({
    fn: (tSec) => contactValueBody(params, tSec, body),
    leftSec: ingressOuterSec,
    rightSec: ingressOuterSec + coarseStepSec,
  });

  let egressOuterSec = coarseCenterSec;
  while (egressOuterSec < period && !(contactValueBody(params, egressOuterSec, body) > 0)) {
    egressOuterSec += coarseStepSec;
  }
  const egressSec = bisectRoot({
    fn: (tSec) => contactValueBody(params, tSec, body),
    leftSec: egressOuterSec - coarseStepSec,
    rightSec: egressOuterSec,
  });

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
  const centerSec = (centerLeftSec + centerRightSec) / 2;

  return {
    centerSec,
    durationSec: egressSec - ingressSec,
    ingressSec,
    egressSec,
  };
}

describe("transit timing tracker", () => {
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
});
