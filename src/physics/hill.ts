/** Computes Hill-sphere stability diagnostics from orbital and mass parameters. */
//
// Hill radius + simple satellite-stability heuristics.
//
// Scientific correctness & assumptions
// -----------------------------------
// The classical Hill radius for a secondary body of mass m orbiting a primary of mass M at
// instantaneous separation r is (circular restricted 3-body approximation):
//
//   R_H(r) ≈ r * ( m / (3 M) )^(1/3)
//
// This module provides *validation warnings* only; it does not enforce constraints.

import type { OrbitElements, SystemParams } from "../core/types";
import {
  hillRadius,
  maxStableProgradeMoonAxisDomingos,
  maxStableRetrogradeMoonAxisDomingos,
} from "./hillRadius";

export type HillRadiusOptions = {
  /**
   * If true, use periapsis distance r_p = a(1-e), giving a conservative minimum Hill radius
   * along an eccentric orbit (recommended for stability warnings).
   * If false, use r = a (circular/mean-distance approximation).
   */
  usePeriapsis?: boolean;
};

/** Validation warning severity. */
export type PhysicsValidationSeverity = "info" | "warn";

/** A structured warning that UI code can display. */
export type PhysicsValidationMessage = {
  severity: PhysicsValidationSeverity;
  code: string;
  message: string;
  details?: Record<string, unknown>;
};

type PlanetParams = SystemParams["planet"];
type MoonParams = NonNullable<SystemParams["moon"]>;

type HillRawInputs = {
  planet: PlanetParams;
  moon: MoonParams;
  planetOrbit: OrbitElements;
  moonOrbit: OrbitElements;
  aP: number;
  eP: number;
  aM: number;
  eM: number;
};

type HillMassInputs = HillRawInputs & {
  mStar: number;
  mPlanet: number;
};

type HillStabilityContext = HillMassInputs & {
  hillRPeriapsis: number;
  hillRSemimajor: number;
  aMaxSense: number;
  fracOfHill: number;
  retro: boolean;
};

const DOMINGOS_MAX_PLANET_ECCENTRICITY = 0.9;
const DOMINGOS_MAX_SATELLITE_ECCENTRICITY = 0.5;
const DOMINGOS_REFERENCE_MASS_RATIO = 1e-3;
// The paper samples q = 10^-3. Permit only a narrow rounding band around that
// reference value before treating the fitted threshold as an extrapolation.
const DOMINGOS_MASS_RATIO_RELATIVE_TOLERANCE = 0.05;

type HillInputResolution =
  | { kind: "done"; warnings: PhysicsValidationMessage[] }
  | { kind: "inputs"; inputs: HillRawInputs };

type HillMassResolution =
  | { kind: "done"; warnings: PhysicsValidationMessage[] }
  | { kind: "inputs"; inputs: HillMassInputs };

/**
 * Validate a SystemParams object for simple physics plausibility checks.
 * Returns warnings suitable for UI display (never throws).
 */
export function validateSystemParamsPhysics(p: SystemParams): PhysicsValidationMessage[] {
  const resolved = resolveHillInputs(p);
  if (resolved.kind === "done") return resolved.warnings;

  const orbitWarning = orbitValidationWarning(resolved.inputs);
  if (orbitWarning) return [orbitWarning];

  const massResolved = resolveHillMasses(p, resolved.inputs);
  if (massResolved.kind === "done") return massResolved.warnings;

  const context = buildHillStabilityContext(massResolved.inputs);
  if (context.kind === "done") return context.warnings;

  return collectHillStabilityWarnings(context.inputs);
}

function resolveHillInputs(p: SystemParams): HillInputResolution {
  if (!p?.planet?.orbit || !p?.planet) return { kind: "done", warnings: [] };
  if (!p.moon) return { kind: "done", warnings: [] };

  const providerWarning = orbitProviderWarning(p.planet, p.moon);
  if (providerWarning) return { kind: "done", warnings: [providerWarning] };

  const planetOrbit = p.planet.orbit as OrbitElements;
  const moonOrbit = p.moon.orbitAroundPlanet as OrbitElements;

  return {
    kind: "inputs",
    inputs: {
      planet: p.planet,
      moon: p.moon,
      planetOrbit,
      moonOrbit,
      aP: planetOrbit.a,
      eP: planetOrbit.e,
      aM: moonOrbit?.a,
      eM: moonOrbit?.e ?? 0,
    },
  };
}

function orbitProviderWarning(planet: PlanetParams, moon: MoonParams): PhysicsValidationMessage | undefined {
  if (typeof planet.orbit === "function") {
    return {
      severity: "info",
      code: "HILL_ORBIT_PROVIDER_UNSUPPORTED",
      message: "Planet orbit is a time-dependent provider; Hill-radius warnings were skipped.",
    };
  }

  if (typeof moon.orbitAroundPlanet === "function") {
    return {
      severity: "info",
      code: "HILL_MOON_ORBIT_PROVIDER_UNSUPPORTED",
      message: "Moon orbit is a time-dependent provider; Hill-radius warnings were skipped.",
    };
  }

  return undefined;
}

function orbitValidationWarning(inputs: HillRawInputs): PhysicsValidationMessage | undefined {
  if (!validHillOrbit(inputs.aP, inputs.eP)) {
    return {
      severity: "warn",
      code: "PLANET_ORBIT_INVALID",
      message: "Planet orbit parameters are invalid; Hill-radius checks were skipped.",
    };
  }

  if (!validHillOrbit(inputs.aM, inputs.eM)) {
    return {
      severity: "warn",
      code: "MOON_ORBIT_INVALID",
      message: "Moon orbit parameters are invalid; Hill-radius checks were skipped.",
    };
  }

  return undefined;
}

function validHillOrbit(axis: unknown, eccentricity: unknown): boolean {
  return positiveNumber(axis) && finiteNumber(eccentricity) && eccentricity >= 0 && eccentricity < 1;
}

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function positiveNumber(value: unknown): value is number {
  return finiteNumber(value) && value > 0;
}

function resolveHillMasses(p: SystemParams, inputs: HillRawInputs): HillMassResolution {
  if (!positiveNumber(p.star?.m)) {
    return {
      kind: "done",
      warnings: [
        {
          severity: "info",
          code: "HILL_NO_STAR_MASS",
          message: "Star mass is not set; Hill-radius stability warnings cannot be computed.",
        },
      ],
    };
  }

  if (!positiveNumber(p.planet?.m)) {
    return {
      kind: "done",
      warnings: [
        {
          severity: "info",
          code: "HILL_NO_PLANET_MASS",
          message: "Planet mass is not set; Hill-radius stability warnings cannot be computed.",
        },
      ],
    };
  }

  return { kind: "inputs", inputs: { ...inputs, mStar: p.star.m, mPlanet: p.planet.m } };
}

function buildHillStabilityContext(
  inputs: HillMassInputs,
): { kind: "done"; warnings: PhysicsValidationMessage[] } | { kind: "inputs"; inputs: HillStabilityContext } {
  const hillRPeriapsis = computeHillRadius(inputs, true);
  const hillRSemimajor = computeHillRadius(inputs, false);
  if (!Number.isFinite(hillRPeriapsis) || !Number.isFinite(hillRSemimajor)) {
    return {
      kind: "done",
      warnings: [
        {
          severity: "warn",
          code: "HILL_COMPUTE_FAILED",
          message: "Hill-radius computation failed; stability warnings were skipped.",
        },
      ],
    };
  }

  const retro = inputs.moon.sense === "retrograde";
  // Domingos, Winter & Yokoyama (2006) define the fit in units of the
  // semimajor-axis Hill radius and include e_p in the empirical factor. Using
  // the periapsis radius here would apply (1 - e_p) a second time.
  const aMaxSense = retro
    ? maxStableRetrogradeMoonAxisDomingos(hillRSemimajor, inputs.eP, inputs.eM)
    : maxStableProgradeMoonAxisDomingos(hillRSemimajor, inputs.eP, inputs.eM);

  return {
    kind: "inputs",
    inputs: {
      ...inputs,
      hillRPeriapsis,
      hillRSemimajor,
      aMaxSense,
      retro,
      fracOfHill: inputs.aM / hillRPeriapsis,
    },
  };
}

const computeHillRadius = (inputs: HillMassInputs, usePeriapsis: boolean): number => {
  try {
    return hillRadius(inputs.aP, inputs.eP, inputs.mPlanet, inputs.mStar, { usePeriapsis });
  } catch {
    return Number.NaN;
  }
};

function collectHillStabilityWarnings(context: HillStabilityContext): PhysicsValidationMessage[] {
  const fitDomainWarning = domingosFitDomainWarning(context);
  return [
    ...moonApoapsisWarnings(context),
    fitDomainWarning ?? moonStabilityLimitWarning(context),
    ...hillMassRatioWarnings(context),
  ];
}

function domingosFitDomainWarning(context: HillStabilityContext): PhysicsValidationMessage | undefined {
  const massRatio = context.mPlanet / context.mStar;
  const massRatioRelativeError = Math.abs(massRatio / DOMINGOS_REFERENCE_MASS_RATIO - 1);
  const withinDomain =
    context.eP <= DOMINGOS_MAX_PLANET_ECCENTRICITY &&
    context.eM <= DOMINGOS_MAX_SATELLITE_ECCENTRICITY &&
    Number.isFinite(massRatioRelativeError) &&
    massRatioRelativeError <= DOMINGOS_MASS_RATIO_RELATIVE_TOLERANCE;
  if (withinDomain) return undefined;

  return {
    severity: "warn",
    code: "HILL_FIT_OUT_OF_DOMAIN",
    message:
      "The Domingos satellite-stability fit is outside its sampled eccentricity or mass-ratio domain; no fitted stability threshold is asserted.",
    details: {
      ePlanet: context.eP,
      eMoon: context.eM,
      mPlanet_over_mStar: massRatio,
      sampledDomain: {
        ePlanetMax: DOMINGOS_MAX_PLANET_ECCENTRICITY,
        eMoonMax: DOMINGOS_MAX_SATELLITE_ECCENTRICITY,
        referenceMassRatio: DOMINGOS_REFERENCE_MASS_RATIO,
        massRatioRelativeTolerance: DOMINGOS_MASS_RATIO_RELATIVE_TOLERANCE,
      },
    },
  };
}

function moonApoapsisWarnings(context: HillStabilityContext): PhysicsValidationMessage[] {
  const apoM = context.aM * (1 + context.eM);
  if (!Number.isFinite(apoM) || apoM <= context.hillRPeriapsis) return [];

  return [
    {
      severity: "warn",
      code: "MOON_APO_OUTSIDE_HILL",
      message:
        "Moon apoapsis lies outside the Hill sphere (at planetary periapsis); a bound orbit is unlikely.",
      details: {
        aMoon: context.aM,
        eMoon: context.eM,
        apoMoon: apoM,
        hillR_periapsis: context.hillRPeriapsis,
      },
    },
  ];
}

function moonStabilityLimitWarning(context: HillStabilityContext): PhysicsValidationMessage {
  return exceedsSenseAwareLimit(context)
    ? beyondHillStabilityWarning(context)
    : hillStabilityOkMessage(context);
}

function exceedsSenseAwareLimit(context: HillStabilityContext): boolean {
  return Number.isFinite(context.aMaxSense) && context.aM > context.aMaxSense;
}

function beyondHillStabilityWarning(context: HillStabilityContext): PhysicsValidationMessage {
  return {
    severity: "warn",
    code: "MOON_BEYOND_HILL_STABILITY",
    message: context.retro
      ? "Moon semi-major axis exceeds a conservative retrograde stability limit (Hill-sphere heuristic). The configuration may be dynamically unstable."
      : "Moon semi-major axis exceeds a conservative prograde stability limit (Hill-sphere heuristic). The configuration may be dynamically unstable.",
    details: hillStabilityDetails(context, true),
  };
}

function hillStabilityOkMessage(context: HillStabilityContext): PhysicsValidationMessage {
  return {
    severity: "info",
    code: "MOON_HILL_OK",
    message: context.retro
      ? "Moon orbit is within a conservative Hill-sphere retrograde stability heuristic."
      : "Moon orbit is within a conservative Hill-sphere prograde stability heuristic.",
    details: hillStabilityDetails(context, false),
  };
}

function hillStabilityDetails(
  context: HillStabilityContext,
  includeEccentricity: boolean,
): Record<string, unknown> {
  return {
    aMoon: context.aM,
    ...(includeEccentricity ? { eMoon: context.eM } : {}),
    hillR_periapsis: context.hillRPeriapsis,
    hillR_semimajor: context.hillRSemimajor,
    aCrit_sense: context.aMaxSense,
    sense: context.retro ? "retrograde" : "prograde",
    aMoon_over_RH: context.fracOfHill,
  };
}

function hillMassRatioWarnings(context: HillStabilityContext): PhysicsValidationMessage[] {
  const massRatio = context.mPlanet / context.mStar;
  if (!Number.isFinite(massRatio) || massRatio <= 0.05) return [];

  return [
    {
      severity: "info",
      code: "HILL_MASS_RATIO_LARGE",
      message:
        "Planet-to-star mass ratio is relatively large; the simple Hill-radius approximation may be less accurate (it assumes a hierarchical system).",
      details: { mPlanet_over_mStar: massRatio },
    },
  ];
}
