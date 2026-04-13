import { DEFAULT_BINARY_LAB_CONFIG_V4 } from "../../src/app/binaryLab";
import { binaryFluxDisplayBaseline, scaleFluxForDisplay } from "../../src/app/displayFlux";
import { circleIntersectionArea } from "../../src/photometry/mutualEvents";
import { resolveDetachedBinaryLuminosities } from "../../src/photometry/stellarBandFlux";
import { createSimulationV4 } from "../../src/sim/v4/runtime";
import type { SimulationConfigV4 } from "../../src/sim/v4/types";
import type { SimulationStepV3 } from "../../src/sim/v3";

export async function withBinaryLabSimulation<T>(
  run: (args: { baseline: number; fluxAt: (tSec: number) => number }) => T,
): Promise<T> {
  const sim = createSimulationV4(DEFAULT_BINARY_LAB_CONFIG_V4);
  await sim.prepare();
  const baseline = binaryFluxDisplayBaseline(DEFAULT_BINARY_LAB_CONFIG_V4) ?? 1;
  try {
    return run({
      baseline,
      fluxAt: (tSec: number) => scaleFluxForDisplay(sim.step(tSec).flux.total, baseline),
    });
  } finally {
    // createSimulationV4() has no disposable resources; keep the helper symmetric
    // with the app runtime without inventing a fake dispose contract.
  }
}

export function buildUnequalBinaryBenchmarkConfig(band: "g" | "r"): SimulationConfigV4 {
  return {
    version: "4",
    mode: "detached-binary-lab",
    runtime: { mode: "realtime" },
    observer: { dir: { x: 1, y: 0, z: 0 } },
    bodies: {
      stars: [
        {
          id: "star-a",
          r: 1.0,
          m: 1.25,
          teffK: 6_600,
          loggCgs: 4.1,
          metallicityDex: 0,
          passband: band,
        },
        {
          id: "star-b",
          r: 0.78,
          m: 0.95,
          teffK: 5_050,
          loggCgs: 4.55,
          metallicityDex: -0.1,
          passband: band,
        },
      ],
      planets: [],
      moons: [],
    },
    orbits: {
      binary: { a: 0.2, e: 0, inc: 0, Omega: 0, omega: 0, period: 10, t0: 0 },
      hierarchy: [],
    },
    photometry: {
      baselineFlux: 1,
      gridRes: 240,
      limbDarkeningModel: {
        bandpass: band,
        default: { kind: "quadratic", u1: band === "g" ? 0.44 : 0.34, u2: band === "g" ? 0.21 : 0.23 },
      },
    },
  };
}

export function buildSymmetricBinaryBenchmarkConfig(band: "g" | "r"): SimulationConfigV4 {
  return {
    version: "4",
    mode: "detached-binary-lab",
    runtime: { mode: "realtime" },
    observer: { dir: { x: 1, y: 0, z: 0 } },
    bodies: {
      stars: [
        {
          id: "star-a",
          r: 0.92,
          m: 1.08,
          teffK: 5_850,
          loggCgs: 4.35,
          metallicityDex: 0,
          passband: band,
        },
        {
          id: "star-b",
          r: 0.92,
          m: 1.08,
          teffK: 5_850,
          loggCgs: 4.35,
          metallicityDex: 0,
          passband: band,
        },
      ],
      planets: [],
      moons: [],
    },
    orbits: {
      binary: { a: 0.2, e: 0, inc: 0, Omega: 0, omega: 0, period: 10, t0: 0 },
      hierarchy: [],
    },
    photometry: {
      baselineFlux: 1,
      gridRes: 240,
      limbDarkeningModel: {
        bandpass: band,
        default: { kind: "quadratic", u1: 0.32, u2: 0.18 },
      },
    },
  };
}

export function buildBlueSecondaryBinaryBenchmarkConfig(band: "g" | "r"): SimulationConfigV4 {
  return {
    version: "4",
    mode: "detached-binary-lab",
    runtime: { mode: "realtime" },
    observer: { dir: { x: 1, y: 0, z: 0 } },
    bodies: {
      stars: [
        {
          id: "star-a",
          r: 1.08,
          m: 1.18,
          teffK: 5_550,
          loggCgs: 4.22,
          metallicityDex: 0,
          passband: band,
        },
        {
          id: "star-b",
          r: 0.74,
          m: 1.02,
          teffK: 7_350,
          loggCgs: 4.48,
          metallicityDex: -0.05,
          passband: band,
        },
      ],
      planets: [],
      moons: [],
    },
    orbits: {
      binary: { a: 0.2, e: 0, inc: 0, Omega: 0, omega: 0, period: 10, t0: 0 },
      hierarchy: [],
    },
    photometry: {
      baselineFlux: 1,
      gridRes: 240,
      limbDarkeningModel: {
        bandpass: band,
        default: { kind: "quadratic", u1: band === "g" ? 0.39 : 0.31, u2: band === "g" ? 0.2 : 0.22 },
      },
    },
  };
}

export function buildSameSedUnequalBinaryBenchmarkConfig(band: "g" | "r"): SimulationConfigV4 {
  return {
    version: "4",
    mode: "detached-binary-lab",
    runtime: { mode: "realtime" },
    observer: { dir: { x: 1, y: 0, z: 0 } },
    bodies: {
      stars: [
        {
          id: "star-a",
          r: 1.06,
          m: 1.14,
          teffK: 5_900,
          loggCgs: 4.28,
          metallicityDex: 0,
          passband: band,
        },
        {
          id: "star-b",
          r: 0.72,
          m: 0.92,
          teffK: 5_900,
          loggCgs: 4.5,
          metallicityDex: 0,
          passband: band,
        },
      ],
      planets: [],
      moons: [],
    },
    orbits: {
      binary: { a: 0.2, e: 0, inc: 0, Omega: 0, omega: 0, period: 10, t0: 0 },
      hierarchy: [],
    },
    photometry: {
      baselineFlux: 1,
      gridRes: 240,
      limbDarkeningModel: {
        bandpass: band,
        default: { kind: "quadratic", u1: 0.33, u2: 0.19 },
      },
    },
  };
}

export function buildSameSedUnequalExplicitLawBinaryBenchmarkConfig(band: "g" | "r"): SimulationConfigV4 {
  return {
    version: "4",
    mode: "detached-binary-lab",
    runtime: { mode: "realtime" },
    observer: { dir: { x: 1, y: 0, z: 0 } },
    bodies: {
      stars: [
        {
          id: "star-a",
          r: 1.06,
          m: 1.14,
          teffK: 5_900,
          loggCgs: 4.28,
          metallicityDex: 0,
          passband: band,
        },
        {
          id: "star-b",
          r: 0.72,
          m: 0.92,
          teffK: 5_900,
          loggCgs: 4.5,
          metallicityDex: 0,
          passband: band,
        },
      ],
      planets: [],
      moons: [],
    },
    orbits: {
      binary: { a: 0.2, e: 0, inc: 0, Omega: 0, omega: 0, period: 10, t0: 0 },
      hierarchy: [],
    },
    photometry: {
      baselineFlux: 1,
      gridRes: 240,
      limbDarkeningModel: {
        bandpass: band,
        bands: {
          g: { kind: "quadratic", u1: 0.33, u2: 0.19 },
          r: { kind: "quadratic", u1: 0.33, u2: 0.19 },
        },
      },
    },
  };
}

export function buildSameSedSymmetricBinaryBenchmarkConfig(band: "g" | "r"): SimulationConfigV4 {
  return {
    version: "4",
    mode: "detached-binary-lab",
    runtime: { mode: "realtime" },
    observer: { dir: { x: 1, y: 0, z: 0 } },
    bodies: {
      stars: [
        {
          id: "star-a",
          r: 0.92,
          m: 1.03,
          teffK: 5_900,
          loggCgs: 4.36,
          metallicityDex: 0,
          passband: band,
        },
        {
          id: "star-b",
          r: 0.92,
          m: 1.03,
          teffK: 5_900,
          loggCgs: 4.36,
          metallicityDex: 0,
          passband: band,
        },
      ],
      planets: [],
      moons: [],
    },
    orbits: {
      binary: { a: 0.2, e: 0, inc: 0, Omega: 0, omega: 0, period: 10, t0: 0 },
      hierarchy: [],
    },
    photometry: {
      baselineFlux: 1,
      gridRes: 240,
      limbDarkeningModel: {
        bandpass: band,
        bands: {
          g: { kind: "quadratic", u1: 0.33, u2: 0.19 },
          r: { kind: "quadratic", u1: 0.33, u2: 0.19 },
        },
      },
    },
  };
}

export async function withBinarySimulationConfig<T>(
  config: SimulationConfigV4,
  run: (args: { baseline: number; fluxAt: (tSec: number) => number }) => T,
): Promise<T> {
  const sim = createSimulationV4(config);
  await sim.prepare();
  const baseline = binaryFluxDisplayBaseline(config) ?? 1;
  try {
    return run({
      baseline,
      fluxAt: (tSec: number) => scaleFluxForDisplay(sim.step(tSec).flux.total, baseline),
    });
  } finally {
    // No dispose surface; keep helper shape symmetric with other runtime tests.
  }
}

export function scientificBrowserBinaryConfig(config: SimulationConfigV4): SimulationConfigV4 {
  return {
    ...structuredClone(config),
    runtime: {
      ...(config.runtime ?? {}),
      executionMode: "scientific-browser",
    },
    dynamics: {
      ...(config.dynamics ?? {}),
      relativity: {
        enabled: false,
        ltte: false,
        shapiro: false,
        grPrecession: false,
      },
    },
  };
}

export function withUniformDiskExplicitLaw(config: SimulationConfigV4, band: "g" | "r"): SimulationConfigV4 {
  return {
    ...structuredClone(config),
    photometry: {
      ...(config.photometry ?? {}),
      gridRes: Math.max(360, config.photometry?.gridRes ?? 0),
      limbDarkeningModel: {
        bandpass: band,
        bands: {
          [band]: { kind: "quadratic", u1: 0, u2: 0 },
        },
      },
    },
  };
}

export async function stepBinaryConfig(config: SimulationConfigV4, tSec = 0): Promise<SimulationStepV3> {
  const sim = createSimulationV4(config);
  await sim.prepare();
  return sim.step(tSec);
}

export function analyticUniformBinaryDisplayFlux(args: {
  config: SimulationConfigV4;
  step: SimulationStepV3;
}): number {
  const { config, step } = args;
  const [starA, starB] = config.bodies.stars;
  const baseline = binaryFluxDisplayBaseline(config);
  if (!starA || !starB || !(baseline && baseline > 0)) {
    throw new Error("analytic detached-binary reference requires two stars and a finite baseline");
  }

  const resolved = resolveDetachedBinaryLuminosities({
    primary: starA,
    secondary: starB,
    fallbackPassband: undefined,
    secondaryFallbackLuminosityScale: 0,
  });
  if (resolved.source !== "physical-bandpass") {
    throw new Error("analytic detached-binary reference requires physical bandpass luminosities");
  }

  const relativeSky = step.renderSignals.orbitFrames.planetSky;
  const separation = Math.hypot(relativeSky.x, relativeSky.y);
  const overlap = circleIntersectionArea(separation, starA.r, starB.r);
  const areaA = Math.PI * starA.r * starA.r;
  const areaB = Math.PI * starB.r * starB.r;
  const intensityA = resolved.primary / areaA;
  const intensityB = resolved.secondary / areaB;

  let totalFlux = resolved.primary + resolved.secondary;
  if (relativeSky.z > 0) {
    totalFlux -= intensityA * overlap;
  } else if (relativeSky.z < 0) {
    totalFlux -= intensityB * overlap;
  }

  return scaleFluxForDisplay(totalFlux, baseline);
}

export function minFluxNear(args: {
  fluxAt: (tSec: number) => number;
  centerSec: number;
  halfWindowSec: number;
  samples: number;
}): number {
  const { fluxAt, centerSec, halfWindowSec, samples } = args;
  let minFlux = Number.POSITIVE_INFINITY;
  for (let i = 0; i < samples; i += 1) {
    const alpha = samples === 1 ? 0.5 : i / (samples - 1);
    const tSec = centerSec - halfWindowSec + 2 * halfWindowSec * alpha;
    minFlux = Math.min(minFlux, fluxAt(tSec));
  }
  return minFlux;
}

export function minFluxTimeNear(args: {
  fluxAt: (tSec: number) => number;
  centerSec: number;
  halfWindowSec: number;
  samples: number;
}): number {
  const { fluxAt, centerSec, halfWindowSec, samples } = args;
  let minFlux = Number.POSITIVE_INFINITY;
  let minTimeSec = centerSec;
  for (let i = 0; i < samples; i += 1) {
    const alpha = samples === 1 ? 0.5 : i / (samples - 1);
    const tSec = centerSec - halfWindowSec + 2 * halfWindowSec * alpha;
    const flux = fluxAt(tSec);
    if (flux < minFlux) {
      minFlux = flux;
      minTimeSec = tSec;
    }
  }
  return minTimeSec;
}
