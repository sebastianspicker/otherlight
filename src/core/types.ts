// src/core/types.ts
//
// Core domain types for the simulation.
//
// -----------------------------------------------------------------------------
// Conventions (project-wide, source of truth)
// -----------------------------------------------------------------------------
// Units:
// - Lengths are arbitrary "simulation units" (must be internally consistent).
// - Time is seconds.
// - Angles are radians.
//
// Coordinate / observer convention:
// - The star is at the inertial origin.
// - `observer.dir` is a line-of-sight direction vector in inertial coordinates that points
//   **from the star toward the observer**.
// - `projectToSky(r, observer.dir)` (see src/physics/frames.ts) returns (x,y) in the sky plane and
//   a depth coordinate z = dot(r, ez) where ez is the normalized observer direction.
//   In this convention:
//   - Larger sky.z means "closer to the observer" along the line of sight.
//   - A body is considered "in front of the star" for transit/occultation purposes when
//     dot(rBody, observer.dir) > 0 (see src/sim/sim.ts).
//
// Photometry convention / flux composition:
// - Transit photometry functions return a multiplicative stellar attenuation factor F_transit(t)
//   normalized to the unobscured stellar disk (including any modeled brightness map), typically in [0,1].
// - Out-of-transit components (planet/moon phase curves, stellar variability, forward scattering, etc.)
//   are modeled as additive flux terms in "stellar units" (baseline star is typically ~1).
// - The combined model used by sim.ts is conceptually:
//     F_total(t) = (baselineFlux + additive_terms(t)) * F_transit(t)
//   where `baselineFlux` defaults to 1.0 if omitted.
//
// -----------------------------------------------------------------------------
// Model "source of truth" policy (legacy vs preferred)
// -----------------------------------------------------------------------------
// Limb darkening:
// - Legacy (kept for backward compatibility): `PhotometryParams.limbDarkening` (quadratic u1/u2).
// - Preferred: `PhotometryParams.limbDarkeningModel` (multi-law, multi-band + optional validation).
// - Runtime selection is performed in sim.ts; if limbDarkeningModel resolves to a law it should take
//   precedence, otherwise fall back to legacy quadratic, otherwise uniform disk.
//
// Phase curves:
// - Phase curve parameters are stored in `PhotometryParams.phaseCurve` (planet) and
//   `PhotometryParams.moonPhaseCurve` (moon).
// - The canonical implementation is `src/photometry/phaseCurve.ts` (which may internally use
//   dayNightVisibility helpers).
//
// Instrument noise / systematics:
// - Preferred (this repo): strong typing via `InstrumentNoiseSystematicsParams` from
//   `src/photometry/instrumentNoise.ts`.
// - This file intentionally keeps PhotometryParams JSON-serializable and avoids importing from UI
//   entrypoints; nevertheless importing the noise type here does NOT create a runtime dependency cycle
//   (types are erased), and it gives correct compile-time safety.
//
// -----------------------------------------------------------------------------
// Compatibility notes
// -----------------------------------------------------------------------------
// - Types are intentionally permissive (mostly optional) so new model knobs do not break presets,
//   JSON-cloned configs, or UI controls.
// - Existing field names (especially StepResult diagnostics) are preserved.
//

import type Vec3 from "../physics/vec3";
import type { InstrumentNoiseSystematicsParams } from "../photometry/instrumentNoise";

/**
 * Classical orbital elements (elliptic orbit).
 *
 * Conventions:
 * - e is expected in [0,1) for elliptic orbits.
 * - Angles are in radians.
 *
 * Notes:
 * - Some angles become undefined for special cases (e.g. omega undefined when e=0),
 *   but we keep them as numbers for simplicity and handle edge cases in physics code.
 * - For interactive presets, keeping the full element set avoids schema churn.
 */
export type OrbitElements = {
  /** Semi-major axis (simulation length units). */
  a: number;

  /** Eccentricity (elliptic): [0,1). */
  e: number;

  /** Inclination [rad]. */
  inc: number;

  /** Longitude of ascending node / RAAN [rad]. */
  Omega: number;

  /** Argument of periapsis [rad]. */
  omega: number;

  /** Orbital period [s]. */
  period: number;

  /** Time of periapsis passage [s]. */
  t0: number;
};

/**
 * Provider for time-dependent orbital elements.
 *
 * Intended use:
 * - Long-timescale effects (precession, tidal drift) can be represented as OrbitElements(t).
 * - sim.ts can accept either constant elements or a provider without changing the core Kepler solver.
 *
 * Serialization note:
 * - Functions are not JSON-serializable. For presets/UI, store parameters and build providers in code
 *   (e.g. via helpers in src/physics/secular.ts).
 */
export type OrbitElementsProvider = (t: number) => OrbitElements;

/**
 * A spherical body (star, planet, moon) with radius and optional mass.
 */
export type Body = {
  /** Radius (simulation length units). */
  r: number;

  /**
   * Optional mass.
   *
   * Not required for purely kinematic Kepler orbits, but useful for:
   * - Hill-sphere checks
   * - barycentric planet-moon motion (TTV/TDV in stepSystem)
   * - tides / stability heuristics
   *
   * Units:
   * - Arbitrary, but must be self-consistent across bodies (only ratios matter for barycenter).
   */
  m?: number;
};

/**
 * Quadratic limb darkening coefficients.
 *
 * Intensity law:
 *   I(mu)/I(1) = 1 - u1(1-mu) - u2(1-mu)^2
 *
 * Notes:
 * - Physical plausibility constraints are model-dependent; common heuristics can be enforced
 *   via LimbDarkeningConstraints at validation time (not at the bare type level).
 */
export type LimbDarkeningQuadratic = {
  /**
   * IMPORTANT: must be named u1/u2 because existing implementation expects ld.u1, ld.u2.
   */
  u1: number;
  u2: number;
};

/** Identifier string for a photometric passband (e.g. "Kepler", "TESS", "V", "R", "g", "r"). */
export type PassbandId = string;

/**
 * Limb-darkening plausibility/validation policy (optional).
 *
 * Purpose:
 * - Provide a plain-data (serializable) way to request validation behavior.
 *
 * Important:
 * - This is only a request; implementations may ignore it unless explicitly wired in.
 * - Validation is model-dependent and may be conservative.
 */
export type LimbDarkeningConstraints = {
  /**
   * none: do not validate (default; backwards compatible)
   * warn: warn (console) if violated
   * throw: throw Error if violated
   */
  mode?: "none" | "warn" | "throw";

  /** Number of mu samples for numerical checks over mu ∈ [0,1]. */
  muSamples?: number;

  /** Enforce I(mu) >= 0 (within tolerance). */
  nonNegativeIntensity?: boolean;

  /**
   * Enforce that intensity increases with mu (i.e. darkens toward limb).
   * Not always enforced by default because some fitted profiles can be slightly non-monotone.
   */
  monotoneIncreasingWithMu?: boolean;

  /** Optional upper bound on I(mu) for sanity (e.g. to prevent extreme limb brightening). */
  maxIntensity?: number;

  /** Numerical tolerance used in checks. */
  eps?: number;
};

/**
 * More flexible limb-darkening laws beyond quadratic.
 *
 * All laws are normalized such that I(1)=1 (disk-center intensity normalization).
 * These are plain-data and can be used for multi-band coefficient tables.
 */
export type LimbDarkeningLawQuadratic = {
  kind: "quadratic";
  u1: number;
  u2: number;
};

/**
 * Three-parameter nonlinear law (reduced Claret-like form):
 *   I(mu) = 1 - a1(1-mu^(1/2)) - a2(1-mu) - a3(1-mu^(3/2))
 */
export type LimbDarkeningLawThreeParameter = {
  kind: "three-parameter";
  a1: number;
  a2: number;
  a3: number;
};

/**
 * Four-parameter Claret law:
 *   I(mu) = 1 - a1(1-mu^(1/2)) - a2(1-mu) - a3(1-mu^(3/2)) - a4(1-mu^2)
 */
export type LimbDarkeningLawFourParameter = {
  kind: "four-parameter";
  a1: number;
  a2: number;
  a3: number;
  a4: number;
};

/** Union of supported limb-darkening law parameterizations. */
export type LimbDarkeningLaw =
  | LimbDarkeningLawQuadratic
  | LimbDarkeningLawThreeParameter
  | LimbDarkeningLawFourParameter;

/**
 * Limb-darkening model wrapper supporting multi-band coefficients and validation policy.
 *
 * Preferred usage:
 * - New code should use limbDarkeningModel when present, because it supports:
 *   - multiple laws (quadratic, 3-parameter, 4-parameter)
 *   - multiple passbands
 *   - explicit validation policy (constraints)
 *
 * Legacy usage:
 * - Existing code may continue to use PhotometryParams.limbDarkening (quadratic u1/u2).
 */
export type LimbDarkeningModel = {
  /**
   * Active passband id used to select coefficients from `bands`.
   * If omitted, code should use `default` or fall back to legacy quadratic.
   */
  bandpass?: PassbandId;

  /** Default law if no band match exists. */
  default?: LimbDarkeningLaw;

  /** Multi-band coefficient table keyed by passband id. */
  bands?: Record<PassbandId, LimbDarkeningLaw>;

  /** Optional validation policy for the selected coefficients. */
  constraints?: LimbDarkeningConstraints;
};

/**
 * Brightness modulation patches painted on the projected stellar disk (sky plane).
 *
 * Interpretation:
 * - Patches are applied as multiplicative intensity factors in the sky plane.
 * - They represent spots/faculae-like intensity perturbations in a toy model.
 */
export type BrightnessPatchShape = "circle" | "ellipse";

export type BrightnessPatch = {
  shape: BrightnessPatchShape;

  /** Patch center in sky-plane coordinates (same units as star radius). */
  x: number;
  y: number;

  /**
   * Multiplicative intensity factor applied inside the patch.
   * Recommended domain: factor >= 0.
   */
  factor: number;

  /** Circle radius (required if shape==="circle"). */
  r?: number;

  /** Ellipse semi-axes (required if shape==="ellipse"). */
  rx?: number;
  ry?: number;

  /** Ellipse rotation angle in radians (optional; default 0). */
  angle?: number;
};

/**
 * Phenomenological phase-curve parameters for body light (reflection + thermal emission),
 * expressed in stellar flux units (baseline star flux ~1).
 *
 * Compatibility:
 * - Matches src/photometry/phaseCurve.ts fields.
 */
export type PhaseCurveParams = {
  enabled?: boolean;

  /** Reflected-light amplitude scale in stellar units (>=0 recommended). */
  reflAmp?: number;

  /** Thermal emission amplitude scale in stellar units (>=0 recommended). */
  thermAmp?: number;

  /** Reflection phase offset [rad] (optional). */
  reflOffset?: number;

  /** Thermal hotspot phase offset [rad] (optional). */
  thermOffset?: number;

  /** If true, use Lambertian reflection; else cosine approximation (legacy control). */
  lambertian?: boolean;

  /** Optional constant nightside floor in stellar units (>=0 recommended). */
  constant?: number;

  /**
   * Optional explicit reflected-light geometric model.
   * If omitted, legacy behavior uses `lambertian ? "lambert" : "cosine"`.
   */
  reflModel?: "lambert" | "cosine";

  /**
   * Optional explicit thermal visibility model.
   * If omitted, implementations may use a legacy cosine-like term with thermOffset.
   */
  thermalModel?: "constant" | "lambert" | "cosine";
};

/**
 * Optional day/night visibility weighting configuration.
 *
 * Status:
 * - A future hook: safe to store in presets and ignore until implemented.
 */
export type DayNightVisibilityParams = {
  enabled?: boolean;
  reflectedModel?: "lambert" | "cosine";
  thermalModel?: "constant" | "lambert" | "cosine";

  /**
   * If true, clamp derived weights/terms to [0,1] and enforce non-negativity.
   * Recommended default for implementations: true.
   */
  clamp?: boolean;
};

/**
 * Parameters for an atmosphere/exosphere transmission signature in transit.
 *
 * Status:
 * - A lightweight config hook; implementation may live in photometry/transitTransmission.ts.
 */
export type AtmosphereTransmissionParams = {
  enabled?: boolean;
  target?: "planet" | "moon";

  /**
   * Opaque core radius in sim length units.
   * If omitted, the solid-body radius (planet.r or moon.r) should be used.
   */
  r0?: number;

  kind?: "hard" | "exponential-halo" | "custom";
  H?: number;
  tau0?: number;

  /** Optional wavelength grid in nm for spectroscopy presets. */
  lambdaNm?: number[];

  /** Optional per-wavelength tau scale factors aligned with lambdaNm. */
  tauScale?: number[];
};

/**
 * Forward-scattering (pre/post-transit brightening) parameters.
 *
 * Status:
 * - Hook only unless implemented elsewhere; values are in stellar units.
 */
export type ForwardScatteringParams = {
  enabled?: boolean;

  /** Amplitude scaling in stellar units. */
  amp?: number;

  kind?: "hg-angle" | "gaussian-time";

  /** HG asymmetry parameter g in [-0.999, 0.999]. */
  g?: number;

  /** Width in radians of orbital phase (toy smoothing / feature width). */
  sigmaPhase?: number;

  /** Phase offset in radians for phenomenological shifting. */
  phaseOffset?: number;

  /** If true (default in implementations), clamp output to be non-negative. */
  clampNonNegative?: boolean;

  /** If true (default in implementations), gate scattering when the body is behind the star. */
  gateWhenBehindStar?: boolean;
};

/**
 * Phenomenological out-of-transit stellar/system variability terms.
 *
 * IMPORTANT:
 * - Must remain compatible with src/photometry/stellarVariability.ts.
 */
export type StellarVariabilityParams = {
  enabled?: boolean;
  beamingAmp?: number;
  ellipsoidalAmp?: number;
  beamingOffset?: number;
  ellipsoidalOffset?: number;
  constant?: number;
};

/**
 * Photometry configuration attached to `star.photometry`.
 *
 * Notes:
 * - This is intended to be plain-data and JSON-serializable.
 * - Numeric sanity constraints should be enforced by callers (UI) and/or model validation.
 */
export type PhotometryParams = {
  /**
   * Baseline normalization for model flux (stellar units).
   * If omitted, code should assume 1.0.
   */
  baselineFlux?: number;

  /**
   * Legacy quadratic limb darkening (single-band).
   *
   * Source of truth:
   * - Used only if limbDarkeningModel does not resolve to a law.
   */
  limbDarkening?: LimbDarkeningQuadratic;

  /**
   * Preferred limb-darkening model (multi-band and multi-law).
   *
   * Source of truth:
   * - If a limb-darkening law is resolved from this model, it should take precedence over legacy
   *   limbDarkening in runtime code (see sim.ts).
   */
  limbDarkeningModel?: LimbDarkeningModel;

  /** Optional brightness inhomogeneities (spots/faculae) on the projected stellar disk. */
  brightnessPatches?: BrightnessPatch[];

  /**
   * Finite exposure/integration time ("smearing") in seconds for a single photometric sample.
   * Applied outside stepSystem() by photometry/smearing.ts.
   */
  cadenceSec?: number;

  /** Number of sub-samples used to approximate the boxcar time integral over cadenceSec. */
  nSubsamples?: number;

  /** Planet phase-curve parameters (implemented). */
  phaseCurve?: PhaseCurveParams;

  /** Moon phase-curve parameters (implemented in sim.ts if used). */
  moonPhaseCurve?: PhaseCurveParams;

  /** Day/night terminator visibility hook (future). */
  dayNightVisibility?: DayNightVisibilityParams;

  /** Forward scattering hook (future). */
  forwardScattering?: ForwardScatteringParams;

  /** Atmosphere/exosphere transmission hook (future). */
  atmosphereTransmission?: AtmosphereTransmissionParams;

  /** Out-of-transit stellar variability terms (implemented). */
  stellarVariability?: StellarVariabilityParams;

  /** Numerical resolution knob for photometry integrators (spatial integration). */
  gridRes?: number;

  /**
   * Instrument noise + systematics measurement-layer configuration (implemented in photometry/instrumentNoise.ts).
   *
   * JSON policy:
   * - This is plain-data and safe to store in presets.
   * - When absent or `enabled` is false, the measurement layer is a no-op.
   */
  instrument?: InstrumentNoiseSystematicsParams;
};

export type Observer = {
  /**
   * Line-of-sight direction in inertial coordinates.
   * Convention: points from the star toward the observer.
   *
   * Note:
   * - It need not be unit length; physics/frames utilities normalize as needed.
   */
  dir: Vec3;
};

/**
 * Optional N-body configuration hooks.
 *
 * Note:
 * - This is a hook; if N-body is not enabled/used by sim.ts, these fields may be ignored.
 */
export type NBodyPlanetMoonParams = {
  enabled?: boolean;

  /** Gravitational parameter mu = G*M for the star (must be > 0). */
  muStar?: number;

  /** Gravitational parameter mu = G*M for the planet (must be > 0). */
  muPlanet?: number;

  /** Gravitational parameter mu = G*M for the moon (must be > 0). */
  muMoon?: number;

  /** Recommended maximum absolute substep dt in seconds. */
  dtMax?: number;

  /** Optional Plummer softening length in sim length units. */
  softening?: number;
};

/**
 * Data-driven exomoon timing/shape configuration.
 *
 * Used by sim.ts for optional:
 * - moon orbit orientation evolution (Ω, i, ω drift)
 * - TDV-like diagnostic quantities
 */
export type ExomoonTimingShapeParams = {
  enabled?: boolean;

  /** Reference epoch for evolution and for “relative to ref” diagnostics. Default: 0. */
  tRef?: number;

  /** Finite-difference time step [s] used when estimating projected sky-plane speeds. */
  velDt?: number;

  // --- Moon orbit orientation evolution (applied to moon.orbitAroundPlanet) ---
  moonOmegaDot?: number; // dΩ/dt [rad/s]
  moonIncDot?: number; // di/dt [rad/s]
  moonOmegaSmallDot?: number; // dω/dt [rad/s]

  moonOmega0?: number;
  moonInc0?: number;
  moonOmegaSmall0?: number;

  /** Optional extra drift in the moon’s sky-plane y direction [units/s] (phenomenological). */
  moonImpactYDot?: number;
};

/**
 * Complete simulation parameters.
 */
export type SystemParams = {
  observer?: Observer;

  star: Body & {
    photometry?: PhotometryParams;
  };

  /** Planet is always present. */
  planet: Body & {
    orbit: OrbitElements | OrbitElementsProvider;
  };

  moon?: Body & {
    orbitAroundPlanet: OrbitElements | OrbitElementsProvider;

    /** Optional: whether the moon orbit is prograde/retrograde relative to the planet orbit. */
    sense?: "prograde" | "retrograde";
  };

  /** Optional dynamics configuration (beyond the Kepler/barycenter model). */
  dynamics?: {
    nbodyPlanetMoon?: NBodyPlanetMoonParams;
    exomoonTimingShape?: ExomoonTimingShapeParams;
  };
};

export type SkyPoint = { x: number; y: number; z: number };

/**
 * Result of one simulation step at time t.
 *
 * Flux fields:
 * - flux: the primary combined flux output used by plots/rendering.
 * - fluxTransitOnly: multiplicative stellar attenuation factor (normalized), if computed.
 * - fluxPhaseOnly: **planet-only** additive phase component (legacy diagnostic naming kept).
 * - fluxTotal: the final combined flux (typically equals `flux`), if computed.
 *
 * Note on diagnostics naming compatibility:
 * - `fluxPhaseOnly` historically refers to the planet phase curve only, not planet+moon.
 * - New decomposition fields should be added as additional optional fields (do not repurpose existing ones).
 */
export type StepResult = {
  /** Primary flux output used by plot/render. */
  flux: number;

  planetSky: SkyPoint;
  moonSky?: SkyPoint;

  // Diagnostic decomposition (existing fields kept for compatibility)
  fluxTransitOnly?: number;

  /**
   * Legacy diagnostic: planet-only additive phase contribution in stellar units.
   * (Kept for UI compatibility.)
   */
  fluxPhaseOnly?: number;

  /**
   * Optional: final combined flux (can equal `flux`).
   * Provided as a convenience for debugging.
   */
  fluxTotal?: number;

  /**
   * Optional convenience diagnostic values.
   *
   * IMPORTANT compatibility:
   * - sim.ts writes meta: { t, nOcculters, planetVisibleFraction, stellarVariabilityFlux, baselineFluxUsed }.
   * - Keep those names and types intact; add new optional keys only.
   */
  meta?: {
    /** Simulation time [s]. */
    t: number;

    /** Number of occulters currently considered in front of the star. */
    nOcculters?: number;

    /** Fraction of the planet disk visible when occulted by the moon (mutual events). */
    planetVisibleFraction?: number;

    /** Fraction of the moon disk visible when occulted by the planet (mutual events). */
    moonVisibleFraction?: number;

    /** Additive stellar variability term in stellar units. */
    stellarVariabilityFlux?: number;

    /** Baseline flux used (defaults to 1.0 when photometry.baselineFlux is absent). */
    baselineFluxUsed?: number;

    /** Planet sky-plane speed diagnostic (units/s). */
    vPlanetSky?: number;

    /** Reference planet sky-plane speed diagnostic (units/s). */
    vPlanetSkyRef?: number;

    /** TDV-like ratio diagnostic (dimensionless). */
    tdvRatio?: number;

    /** Impact parameter proxy b ≈ |y|/R*. */
    bPlanet?: number;

    /** Impact parameter proxy b ≈ |y|/R*. */
    bMoon?: number;
  };
};
