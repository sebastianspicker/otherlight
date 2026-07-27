/** Defines limb-darkening law and constraint contracts for photometry. */

//
// Limb-darkening types (laws, validation policy, multi-band wrapper).
//

export type PassbandId = string;
export type StellarLimbDarkeningParams = {
  teffK?: number;
  loggCgs?: number;
  metallicityDex?: number;
};

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
  /** Validation mode. */
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
 * Limb-darkening laws.
 *
 * All laws are normalized such that I(1)=1 (disk-center intensity normalization).
 *
 * Physical plausibility note:
 * - For a typical star with I(mu=0) approx 0 (dark limb), the sum of coefficients (u1+u2 or a1+..+an)
 *   should be roughly 1.0.
 * - E.g. for Quadratic: 1 - u1(1-0) - u2(1-0)^2 = 1 - u1 - u2 = I(0). So u1+u2=1 implies I(0)=0.
 */

export type LimbDarkeningLawQuadratic = {
  kind: "quadratic";
  /** Linear coefficient. */
  u1: number;
  /** Quadratic coefficient. */
  u2: number;
};

/**
 * Three-parameter nonlinear law (reduced Claret-like form):
 * I(mu) = 1 - a1(1-mu^(1/2)) - a2(1-mu) - a3(1-mu^(3/2))
 */
export type LimbDarkeningLawThreeParameter = {
  kind: "three-parameter";
  a1: number;
  a2: number;
  a3: number;
};

/**
 * Four-parameter Claret law:
 * I(mu) = 1 - a1(1-mu^(1/2)) - a2(1-mu) - a3(1-mu^(3/2)) - a4(1-mu^2)
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
 */
export type LimbDarkeningModel = {
  /**
   * Active passband id used to select coefficients from `bands`.
   * If omitted, code should use `default` when present.
   */
  bandpass?: PassbandId;

  /** Default law if no band match exists. */
  default?: LimbDarkeningLaw;

  /** Multi-band coefficient table keyed by passband id. */
  bands?: Record<PassbandId, LimbDarkeningLaw>;

  /** Optional stellar-parameter fallback when no explicit table/default law is provided. */
  stellar?: StellarLimbDarkeningParams;

  /** Optional validation policy for the selected coefficients. */
  constraints?: LimbDarkeningConstraints;
};
