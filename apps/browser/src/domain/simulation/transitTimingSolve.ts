/**
 * Owns transit Timing Solve support within the sim layer. Keeps simulation state and numerical execution separate from UI coordination.
 */
import type { SkyPoint, StepEventTimingSolveDiagnostics, BrowserScenarioDraft } from "../model/types";

export type TransitEventEstimate = {
  centerSec: number;
  durationSec: number;
  ingressSec: number;
  egressSec: number;
  ttvSec?: number;
};

type TransitEventSolveResult = {
  event?: TransitEventEstimate;
  diagnostics: StepEventTimingSolveDiagnostics;
};

type TransitEventSample = {
  sky: SkyPoint;
  vSky: SkyPoint;
};

type RootSolveResult = {
  rootSec?: number;
  iterations: number;
  converged: boolean;
};

type BracketScanResult = {
  bracket?: [number, number];
  scans: number;
};

type LinearCenterProjection = {
  dtCenter: number;
  impactMin: number;
  zCenter: number;
};

export function usesExactTransitTiming(params: BrowserScenarioDraft): boolean {
  const fidelity = params.dynamics?.fidelityProfile;
  return fidelity === "accurate" || fidelity === "reference";
}

function computeTtvSec(
  centerSec: number,
  periodSec?: number,
  referenceEpochSec?: number,
): number | undefined {
  if (!(Number.isFinite(periodSec) && (periodSec as number) > 0 && Number.isFinite(referenceEpochSec))) {
    return undefined;
  }
  const k = Math.floor((centerSec - (referenceEpochSec as number)) / (periodSec as number) + 0.5);
  const centerEphem = (referenceEpochSec as number) + k * (periodSec as number);
  return Number.isFinite(centerEphem) ? centerSec - centerEphem : undefined;
}

export function computeTransitReferenceEpochSec(args: {
  rStar: number;
  rBody: number;
  periodSec?: number;
  t0Sec?: number;
  sampleAt?: (tSec: number) => TransitEventSample | undefined;
}): number | undefined {
  const { rStar, rBody, periodSec, t0Sec, sampleAt } = args;
  if (!(Number.isFinite(periodSec) && (periodSec as number) > 0 && Number.isFinite(t0Sec) && sampleAt)) {
    return undefined;
  }

  const scanCount = 24;
  const halfWindowSec = (periodSec as number) / 2;
  let bestCenterSec: number | undefined;
  let bestDistanceSec = Number.POSITIVE_INFINITY;

  for (let index = 0; index <= scanCount; index++) {
    const alpha = index / scanCount - 0.5;
    const trialSec = (t0Sec as number) + alpha * (periodSec as number);
    const sample = sampleAt(trialSec);
    if (!sample) continue;
    const event = estimateTransitEvent({
      tObsSec: trialSec,
      rStar,
      rBody,
      sky: sample.sky,
      vSky: sample.vSky,
      periodSec,
      sampleAt,
    });
    const centerSec = event?.centerSec;
    if (!Number.isFinite(centerSec)) continue;
    const distanceSec = Math.abs((centerSec as number) - (t0Sec as number));
    if (distanceSec > halfWindowSec + 1e-6 || distanceSec >= bestDistanceSec) continue;
    bestDistanceSec = distanceSec;
    bestCenterSec = centerSec;
  }

  return bestCenterSec;
}

function estimateTransitEventLinearized(args: {
  tObsSec: number;
  rStar: number;
  rBody: number;
  sky: SkyPoint;
  vSky: SkyPoint;
  periodSec?: number;
  transitReferenceEpochSec?: number;
}): TransitEventEstimate | undefined {
  const { tObsSec, rStar, rBody, sky, vSky, periodSec, transitReferenceEpochSec } = args;
  if (!hasValidLinearTransitInputs(rStar, rBody, sky, vSky)) return undefined;

  const speed2 = skyPlaneSpeedSquared(vSky);
  if (speed2 === undefined) return undefined;

  const center = projectLinearCenter(sky, vSky, speed2);
  const rSum = rStar + rBody;

  if (!isVisibleTransitCenter(center, rSum)) return undefined;

  const durationSec = linearTransitDurationSec(rSum, center.impactMin, speed2);
  if (durationSec === undefined) return undefined;

  const centerSec = tObsSec + center.dtCenter;
  const ingressSec = centerSec - durationSec / 2;
  const egressSec = centerSec + durationSec / 2;
  const ttvSec = computeTtvSec(centerSec, periodSec, transitReferenceEpochSec);

  return { centerSec, durationSec, ingressSec, egressSec, ttvSec };
}

function hasValidLinearTransitInputs(rStar: number, rBody: number, sky: SkyPoint, vSky: SkyPoint): boolean {
  return (
    Number.isFinite(rStar) &&
    rStar > 0 &&
    Number.isFinite(rBody) &&
    rBody > 0 &&
    isFiniteSkyPoint(sky) &&
    isFiniteSkyPoint(vSky)
  );
}

function isFiniteSkyPoint(sky: SkyPoint): boolean {
  return Number.isFinite(sky.x) && Number.isFinite(sky.y) && Number.isFinite(sky.z);
}

function skyPlaneSpeedSquared(vSky: SkyPoint): number | undefined {
  const speed2 = vSky.x * vSky.x + vSky.y * vSky.y;
  return speed2 > 0 ? speed2 : undefined;
}

function projectLinearCenter(sky: SkyPoint, vSky: SkyPoint, speed2: number): LinearCenterProjection {
  const dtCenter = -((sky.x * vSky.x + sky.y * vSky.y) / speed2);
  const xCenter = sky.x + vSky.x * dtCenter;
  const yCenter = sky.y + vSky.y * dtCenter;

  return {
    dtCenter,
    impactMin: Math.hypot(xCenter, yCenter),
    zCenter: sky.z + vSky.z * dtCenter,
  };
}

function isVisibleTransitCenter(center: LinearCenterProjection, rSum: number): boolean {
  return center.impactMin < rSum && center.zCenter > 0;
}

function linearTransitDurationSec(rSum: number, impactMin: number, speed2: number): number | undefined {
  const chord = Math.sqrt(Math.max(0, rSum * rSum - impactMin * impactMin)) * 2;
  const speed = Math.sqrt(speed2);
  return speed > 0 ? chord / speed : undefined;
}

function contactValueAt(sample: TransitEventSample | undefined, rSum: number): number | undefined {
  if (!sample) return undefined;
  const { sky } = sample;
  if (!Number.isFinite(sky.x) || !Number.isFinite(sky.y) || !Number.isFinite(sky.z)) return undefined;
  if (!(sky.z > 0)) return Number.POSITIVE_INFINITY;
  return Math.hypot(sky.x, sky.y) - rSum;
}

function centerDerivativeAt(sample: TransitEventSample | undefined): number | undefined {
  if (!sample) return undefined;
  const { sky, vSky } = sample;
  if (!isFiniteSkyPoint(sky) || !isFiniteSkyPoint(vSky)) return undefined;
  if (!(sky.z > 0)) return undefined;
  return sky.x * vSky.x + sky.y * vSky.y;
}

function findBracketByScan(args: {
  fn: (tSec: number) => number | undefined;
  startSec: number;
  endSec: number;
  samples?: number;
}): BracketScanResult {
  const sampleCount = Math.max(4, Math.floor(args.samples ?? 32));
  let prevT = args.startSec;
  let prevV = args.fn(prevT);

  for (let idx = 1; idx <= sampleCount; idx++) {
    const alpha = idx / sampleCount;
    const tSec = args.startSec + (args.endSec - args.startSec) * alpha;
    const val = args.fn(tSec);
    if (val === undefined) {
      prevT = tSec;
      prevV = val;
      continue;
    }
    if (val === 0) return { bracket: [tSec, tSec], scans: idx + 1 };
    if (prevV !== undefined && Number.isFinite(prevV) && (prevV <= 0 ? val >= 0 : val <= 0)) {
      return { bracket: [prevT, tSec], scans: idx + 1 };
    }
    prevT = tSec;
    prevV = val;
  }

  return { bracket: undefined, scans: sampleCount + 1 };
}

function bisectRoot(args: {
  fn: (tSec: number) => number | undefined;
  leftSec: number;
  rightSec: number;
  tolSec?: number;
  maxIters?: number;
}): RootSolveResult {
  let leftSec = args.leftSec;
  let rightSec = args.rightSec;
  let leftVal = args.fn(leftSec);
  const rightVal = args.fn(rightSec);
  if (leftVal === undefined || rightVal === undefined) return { iterations: 0, converged: false };
  if (leftSec === rightSec) return { rootSec: leftSec, iterations: 0, converged: true };
  if (!(Number.isFinite(leftVal) && Number.isFinite(rightVal))) return { iterations: 0, converged: false };
  if (!(leftVal <= 0 ? rightVal >= 0 : rightVal <= 0)) return { iterations: 0, converged: false };

  const tolSec = args.tolSec ?? 1e-6;
  const maxIters = args.maxIters ?? 48;

  for (let iter = 0; iter < maxIters && rightSec - leftSec > tolSec; iter++) {
    const midSec = (leftSec + rightSec) / 2;
    const midVal = args.fn(midSec);
    if (midVal === undefined || !Number.isFinite(midVal)) return { iterations: iter + 1, converged: false };
    if (Math.abs(midVal) <= 1e-12) return { rootSec: midSec, iterations: iter + 1, converged: true };
    if (leftVal <= 0 ? midVal >= 0 : midVal <= 0) {
      rightSec = midSec;
    } else {
      leftSec = midSec;
      leftVal = midVal;
    }
  }

  return { rootSec: (leftSec + rightSec) / 2, iterations: maxIters, converged: true };
}

function solveTransitEventExact(args: {
  linear: TransitEventEstimate;
  tObsSec: number;
  rStar: number;
  rBody: number;
  sampleAt: (tSec: number) => TransitEventSample | undefined;
  periodSec?: number;
  transitReferenceEpochSec?: number;
}): TransitEventSolveResult {
  const { linear, tObsSec, rStar, rBody, sampleAt, periodSec, transitReferenceEpochSec } = args;
  const rSum = rStar + rBody;
  const maxSpanSec =
    Number.isFinite(periodSec) && (periodSec as number) > 0
      ? (periodSec as number) / 4
      : linear.durationSec * 8;
  const baseSpanSec = Math.max(linear.durationSec, Math.abs(linear.centerSec - tObsSec) * 2, 1e-3);
  const validityFlags: string[] = [];
  let centerIterations = 0;
  let ingressIterations = 0;
  let egressIterations = 0;

  let centerSec = linear.centerSec;
  for (let spanSec = baseSpanSec; spanSec <= Math.max(baseSpanSec, maxSpanSec); spanSec *= 2) {
    const bracketResult = findBracketByScan({
      fn: (trialSec) => centerDerivativeAt(sampleAt(trialSec)),
      startSec: linear.centerSec - spanSec,
      endSec: linear.centerSec + spanSec,
      samples: 48,
    });
    if (!bracketResult.bracket) continue;
    const root = bisectRoot({
      fn: (trialSec) => centerDerivativeAt(sampleAt(trialSec)),
      leftSec: bracketResult.bracket[0],
      rightSec: bracketResult.bracket[1],
      tolSec: 1e-6,
      maxIters: 48,
    });
    centerIterations = Math.max(centerIterations, root.iterations);
    if (root.rootSec === undefined) continue;
    const contactAtCenter = contactValueAt(sampleAt(root.rootSec), rSum);
    if (contactAtCenter !== undefined && contactAtCenter < 0) {
      centerSec = root.rootSec;
      break;
    }
  }

  const contactCenter = contactValueAt(sampleAt(centerSec), rSum);
  if (!(contactCenter !== undefined && contactCenter < 0)) {
    validityFlags.push("center-not-in-transit");
    return {
      event: linear,
      diagnostics: {
        status: "fallback-linear",
        converged: false,
        usedExact: true,
        centerIterations,
        ingressIterations,
        egressIterations,
        validityFlags,
      },
    };
  }

  let ingressBracket: [number, number] | undefined;
  let egressBracket: [number, number] | undefined;
  for (
    let spanSec = Math.max(linear.durationSec, 1e-3);
    spanSec <= Math.max(baseSpanSec, maxSpanSec);
    spanSec *= 2
  ) {
    ingressBracket =
      ingressBracket ??
      findBracketByScan({
        fn: (trialSec) => contactValueAt(sampleAt(trialSec), rSum),
        startSec: centerSec - spanSec,
        endSec: centerSec,
        samples: 64,
      }).bracket;
    egressBracket =
      egressBracket ??
      findBracketByScan({
        fn: (trialSec) => contactValueAt(sampleAt(trialSec), rSum),
        startSec: centerSec,
        endSec: centerSec + spanSec,
        samples: 64,
      }).bracket;
    if (ingressBracket && egressBracket) break;
  }

  if (!ingressBracket) validityFlags.push("ingress-bracket-miss");
  if (!egressBracket) validityFlags.push("egress-bracket-miss");
  if (!ingressBracket || !egressBracket) {
    return {
      event: linear,
      diagnostics: {
        status: "fallback-linear",
        converged: false,
        usedExact: true,
        centerIterations,
        ingressIterations,
        egressIterations,
        validityFlags,
      },
    };
  }

  const ingressRoot = bisectRoot({
    fn: (trialSec) => contactValueAt(sampleAt(trialSec), rSum),
    leftSec: ingressBracket[0],
    rightSec: ingressBracket[1],
    tolSec: 1e-6,
    maxIters: 48,
  });
  ingressIterations = ingressRoot.iterations;
  const egressRoot = bisectRoot({
    fn: (trialSec) => contactValueAt(sampleAt(trialSec), rSum),
    leftSec: egressBracket[0],
    rightSec: egressBracket[1],
    tolSec: 1e-6,
    maxIters: 48,
  });
  egressIterations = egressRoot.iterations;
  const ingressSec = ingressRoot.rootSec;
  const egressSec = egressRoot.rootSec;
  if (ingressSec === undefined) validityFlags.push("ingress-bisect-failed");
  if (egressSec === undefined) validityFlags.push("egress-bisect-failed");
  if (ingressSec === undefined || egressSec === undefined || !(egressSec > ingressSec)) {
    return {
      event: linear,
      diagnostics: {
        status: "fallback-linear",
        converged: false,
        usedExact: true,
        centerIterations,
        ingressIterations,
        egressIterations,
        validityFlags,
      },
    };
  }

  const exactCenterSec =
    centerDerivativeAt(sampleAt(centerSec)) !== undefined ? centerSec : (ingressSec + egressSec) / 2;
  if (centerDerivativeAt(sampleAt(centerSec)) === undefined) validityFlags.push("center-midpoint-fallback");
  return {
    event: {
      centerSec: exactCenterSec,
      durationSec: egressSec - ingressSec,
      ingressSec,
      egressSec,
      ttvSec: computeTtvSec(exactCenterSec, periodSec, transitReferenceEpochSec),
    },
    diagnostics: {
      status: "exact",
      converged: true,
      usedExact: true,
      centerIterations,
      ingressIterations,
      egressIterations,
      validityFlags,
    },
  };
}

export function estimateTransitEventWithDiagnostics(args: {
  tObsSec: number;
  rStar: number;
  rBody: number;
  sky: SkyPoint;
  vSky: SkyPoint;
  periodSec?: number;
  t0Sec?: number;
  transitReferenceEpochSec?: number;
  sampleAt?: (tSec: number) => TransitEventSample | undefined;
}): TransitEventSolveResult {
  const linear = estimateTransitEventLinearized(args);
  if (!linear) {
    return {
      event: undefined,
      diagnostics: {
        status: "invalid-input",
        converged: false,
        usedExact: false,
        centerIterations: 0,
        ingressIterations: 0,
        egressIterations: 0,
        validityFlags: ["invalid-input"],
      },
    };
  }
  if (!args.sampleAt) {
    return {
      event: linear,
      diagnostics: {
        status: "linear-estimate",
        converged: false,
        usedExact: false,
        centerIterations: 0,
        ingressIterations: 0,
        egressIterations: 0,
        validityFlags: [],
      },
    };
  }
  return (
    solveTransitEventExact({
      linear,
      tObsSec: args.tObsSec,
      rStar: args.rStar,
      rBody: args.rBody,
      sampleAt: args.sampleAt,
      periodSec: args.periodSec,
      transitReferenceEpochSec: args.transitReferenceEpochSec,
    }) ?? {
      event: linear,
      diagnostics: {
        status: "fallback-linear",
        converged: false,
        usedExact: true,
        centerIterations: 0,
        ingressIterations: 0,
        egressIterations: 0,
        validityFlags: ["exact-solve-failed"],
      },
    }
  );
}

export function estimateTransitEvent(args: {
  tObsSec: number;
  rStar: number;
  rBody: number;
  sky: SkyPoint;
  vSky: SkyPoint;
  periodSec?: number;
  t0Sec?: number;
  transitReferenceEpochSec?: number;
  sampleAt?: (tSec: number) => TransitEventSample | undefined;
}): TransitEventEstimate | undefined {
  return estimateTransitEventWithDiagnostics(args).event;
}
