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
   * If true (default), apply physical scaling:
   * - Reflected: scales by (R_body / r_star-body)^2.
   * - Thermal/constant: scales by (R_body / R_star)^2.
   */
  physicalScaling?: boolean;
};

/**
 * Parameters for an atmosphere/exosphere transmission signature in transit.
 *
 * Status:
 * - Implemented: used by sim/transitFlux.ts via experimental/photometry/transitTransmission.ts.
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
  beamingAmp?: number;
  ellipsoidalAmp?: number;
  beamingOffset?: number;
  ellipsoidalOffset?: number;
  constant?: number;
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
