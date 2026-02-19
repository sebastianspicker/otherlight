// src/core/typesPhotometry.ts

//
// Photometry configuration types (spots, LD model container, phase curves, etc.)
//

import type { InstrumentNoiseSystematicsParams } from "./instrumentNoiseTypes";
import type { LimbDarkeningModel } from "./typesLimbDarkening";

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

  /**
   * Optional spherical patch definition on the stellar surface.
   * When provided, runtime may project this patch into sky-plane coordinates.
   */
  surface?: {
    /** Latitude [rad], -pi/2..pi/2. */
    lat: number;
    /** Longitude [rad]. */
    lon: number;
    /** Angular radius [rad] on the sphere. */
    angularRadius: number;
  };
};

/**
 * Phenomenological phase-curve parameters for body light (reflection + thermal emission),
 * expressed in stellar flux units (baseline star flux ~1).
 */
export type PhaseCurveParams = {
  enabled?: boolean;

  /**
   * Reflected-light amplitude scale (interpreted as geometric albedo when physical scaling is enabled).
   * Units: dimensionless.
   */
  reflAmp?: number;

  /**
   * Thermal emission amplitude scale (interpreted as surface-brightness ratio when physical scaling is enabled).
   * Units: dimensionless.
   */
  thermAmp?: number;

  /** Reflection phase offset [rad] (optional). */
  reflOffset?: number;

  /** Thermal hotspot phase offset [rad] (optional). */
  thermOffset?: number;

  /** Optional constant nightside floor in stellar units (>=0 recommended). */
  constant?: number;

  /** Optional explicit reflected-light geometric model. */
  reflModel?: "lambert" | "cosine";

  /** Optional explicit thermal visibility model. */
  thermalModel?: "constant" | "lambert" | "cosine";

  /** Legacy control: if true, use Lambertian reflection; else cosine approximation. */
  lambertian?: boolean;

  /**
   * If true (default), clamp geometric weights into [0,1] for robustness.
   * Note: amplitudes are still applied multiplicatively afterwards.
   */
  clamp?: boolean;

  /**
   * If true (default), apply physical scaling:
   * - Reflected: scales by (R_body / r_star-body)^2.
   * - Thermal/constant: scales by (R_body / R_star)^2.
   */
  physicalScaling?: boolean;

  /** Optional thermal inertia model (toy 1-pole response). */
  thermalInertia?: ThermalInertiaParams;
};

/**
 * Simple thermal inertia model for phase curves.
 * The response is modeled as a 1-pole low-pass filter with a phase lag.
 */
export type ThermalInertiaParams = {
  enabled?: boolean;

  /** Bond albedo in [0,1]. */
  albedo?: number;

  /** Emissivity in [0,1]. */
  emissivity?: number;

  /** Thermal response timescale in seconds (tau). */
  thermalTimescaleSec?: number;

  /**
   * Redistribution efficiency in [0,1].
   * 0 => no redistribution (max day/night contrast), 1 => full redistribution (constant).
   */
  redistribution?: number;
};

/**
 * Parameters for an atmosphere/exosphere transmission signature in transit.
 *
 * Status:
 * - Implemented: used by sim/transitFlux.ts via photometry/transitTransmission.ts.
 */
export type AtmosphereTransmissionParams = {
  enabled?: boolean;

  /** Which body the transmission belongs to. */
  target?: "planet" | "moon";

  /**
   * Opaque core radius in sim length units.
   * If omitted, the solid-body radius (planet.r or moon.r) should be used.
   */
  r0?: number;

  /** Toy model kind. */
  kind?: "hard" | "exponential-halo" | "custom";

  /** Scale height / halo length scale (model-dependent). */
  H?: number;

  /** Optical depth scale (model-dependent). */
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
 * - Implemented: used by photometry/forwardScattering.ts and integrated in sim/additiveFlux.ts.
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

  /** Doppler beaming amplitude in stellar flux units (dimensionless). */
  beamingAmp?: number;

  /** Ellipsoidal variation amplitude in stellar flux units (dimensionless). */
  ellipsoidalAmp?: number;

  /** Phase offset for beaming term [rad]. */
  beamingOffset?: number;

  /** Phase offset for ellipsoidal term [rad]. */
  ellipsoidalOffset?: number;

  /** Constant additive term in stellar flux units (dimensionless). */
  constant?: number;

  /**
   * Phase model selection.
   * - "linear-period" (default)
   * - "true-anomaly"
   */
  phaseModel?: StellarVariabilityPhaseModel;

  /**
   * Optional safety clamp bounds for the returned additive term.
   * If omitted, the implementation may use conservative defaults.
   */
  clampMin?: number;
  clampMax?: number;
};

export type StellarVariabilityPhaseModel = "linear-period" | "true-anomaly";

/**
 * Time-evolving star-spot configuration (rotation + lifecycle).
 *
 * This model uses the existing brightnessPatches as the spot map and
 * applies rotation/drift + optional fade-in/out to each patch.
 */
export type SpotEvolutionParams = {
  enabled?: boolean;

  /** Stellar rotation period in seconds (required when enabled). */
  rotationPeriodSec?: number;

  /** Phase offset of the rotation [rad], applied at tRef. */
  rotationPhase0?: number;

  /** Optional additional longitudinal drift rate [rad/s]. */
  driftRateRadPerSec?: number;

  /**
   * Spot lifecycle timescale in seconds (0 => no fade; >0 => periodic fade in/out).
   */
  lifetimeSec?: number;

  /**
   * Spot coverage scaling in [0,1].
   * 0 => suppress spots (factor -> 1), 1 => full patch factors.
   */
  coverage?: number;

  /** Optional reference time for phase/lifecycle [s]. Default 0. */
  tRef?: number;
};

/**
 * Optional day/night visibility weighting configuration.
 *
 * Status:
 * - Implemented: used by photometry/phaseCurve.ts when enabled.
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

export type SpectralBandpassParams = {
  enabled?: boolean;
  /** Wavelength grid [nm]. */
  lambdaNm?: number[];
  /** Optional normalized weights aligned with lambdaNm. */
  weights?: number[];
};

export type AtmosphereRTLayer = {
  /** Reference radius of the layer base [m]. */
  r0: number;
  /** Effective scale height [m]. */
  H: number;
  /** Optical depth scale at layer base (dimensionless). */
  tau0: number;
  /** Optional wavelength exponent: tau ~ (lambda/lambdaRef)^(-alpha). */
  alpha?: number;
};

export type AtmosphereRTParams = {
  enabled?: boolean;
  target?: "planet" | "moon";
  /** Optional wavelength reference [nm] for alpha scaling. Default: 550nm. */
  lambdaRefNm?: number;
  layers?: AtmosphereRTLayer[];
  /** Approximate single-scattering channel. */
  scattering?: {
    enabled?: boolean;
    /** Dimensionless scattering gain in stellar units. */
    gain?: number;
    /** Forwardness parameter similar to HG g. */
    g?: number;
  };
  /** Optional crude thermal emission channel for the atmosphere. */
  emission?: {
    enabled?: boolean;
    /** Additive amplitude in stellar units. */
    amp?: number;
    /** Effective phase lag [rad]. */
    phaseLag?: number;
  };
};

export type ThermalModelAdvancedParams = {
  enabled?: boolean;
  /**
   * Characteristic radiative-equilibrium scale at unit distance (dimensionless temperature proxy).
   * Used only by the advanced thermal model branch.
   */
  equilibriumScale?: number;
  /** Day-night heat redistribution efficiency [0,1]. */
  redistribution?: number;
  /** Thermal response timescale [s]. */
  tauSec?: number;
};

export type RingScatteringParams = {
  enabled?: boolean;
  /** Additive ring-scattering amplitude in stellar units. */
  amp?: number;
  /** Width in orbital phase [rad]. */
  sigmaPhase?: number;
};

export type StellarSurfaceParams = {
  enabled?: boolean;
  /**
   * If true, runtime projects `brightnessPatches[].surface` onto sky plane each step.
   * Legacy 2D patch fields remain supported.
   */
  useSurfacePatches?: boolean;
  /** Stellar equatorial rotation period [s] for surface patch advection. */
  rotationPeriodSec?: number;
  /** Differential rotation coefficient (toy): Omega(lat)=Omega_eq*(1-k*sin^2(lat)). */
  differentialRotationK?: number;
};

/**
 * Photometry configuration attached to star.photometry.
 *
 * Notes:
 * - Intended to be plain-data and JSON-serializable.
 * - Numeric sanity constraints should be enforced by callers (UI) and/or model validation.
 */
export type PhotometryParams = {
  /**
   * Baseline normalization for stellar flux (stellar units).
   * If omitted, code should assume 1.0.
   */
  baselineFlux?: number;

  /**
   * Limb-darkening model (multi-band and multi-law).
   * If omitted or no law resolves, implementations should fall back to a uniform disk model.
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

  /** Day/night terminator visibility configuration (implemented). */
  dayNightVisibility?: DayNightVisibilityParams;

  /** Forward scattering configuration (implemented). */
  forwardScattering?: ForwardScatteringParams;

  /** Atmosphere/exosphere transmission configuration (implemented). */
  atmosphereTransmission?: AtmosphereTransmissionParams;

  /** Out-of-transit stellar variability terms (implemented). */
  stellarVariability?: StellarVariabilityParams;

  /** Numerical resolution knob for photometry integrators (spatial integration). */
  gridRes?: number;

  /** Optional time-evolving spot model (uses brightnessPatches). */
  spotEvolution?: SpotEvolutionParams;

  /** Optional physically-motivated stellar-surface patch projection config. */
  stellarSurface?: StellarSurfaceParams;

  /** Optional advanced atmosphere RT config (coexists with legacy atmosphereTransmission). */
  atmosphereRT?: AtmosphereRTParams;

  /** Optional spectral bandpass grid for additive and transmission channels. */
  spectralBandpass?: SpectralBandpassParams;

  /** Optional advanced thermal model parameters. */
  thermalModelAdvanced?: ThermalModelAdvancedParams;

  /** Optional ring-scattering additive model. */
  ringScattering?: RingScatteringParams;

  /**
   * Instrument noise + systematics measurement-layer configuration.
   * When absent or enabled is false, the measurement layer is a no-op.
   *
   * Merge Strategy:
   * - If both `instrument` and `instrumentNoise` are present, `instrument` TAKES PRECEDENCE.
   */
  instrument?: InstrumentNoiseSystematicsParams;

  /**
   * @deprecated Backwards-compatible alias for older presets/UI code.
   * Prefer `instrument`.
   *
   * Merge Strategy:
   * - Used only if `instrument` is undefined.
   */
  instrumentNoise?: InstrumentNoiseSystematicsParams;
};
