// src/core/instrumentNoiseTypes.ts

//
// Plain-data (JSON-serializable) types for instrument noise + systematics.
//
// Purpose / layering:
// - Lives in core so that core code (e.g. core/types.ts) can reference noise config
//   without importing photometry (avoids core -> photometry dependency cycles).
//
// Units / conventions used by photometry/instrumentNoise.ts:
// - flux: "stellar units" (often normalized so baseline ≈ 1)
// - electronsPerUnitFlux: e- / (flux_unit * second)
// - exposureSec, tauSec, periodSec: seconds
// - sigmaElectrons: e- RMS per exposure
// - sigmaFlux / ampFlux: additive amplitude in flux units
// - phase0, phaseY: radians

export type InstrumentNoiseSystematicsParams = {
  /** Master enable switch. If false/undefined, instrumentNoise layer should be a strict no-op. */
  enabled?: boolean;

  /** Deterministic RNG seed. If omitted, callers may default to 1 for repeatability. */
  seed?: number;

  /**
   * Conversion: detected electrons per (flux_unit * second).
   * Example: if baseline flux ~1 corresponds to 1e6 e-/s, set to 1e6.
   */
  electronsPerUnitFlux?: number;

  /**
   * Exposure time for one photometric sample [s].
   * If 0/undefined, electron-domain noise layers are typically disabled.
   */
  exposureSec?: number;

  /**
   * Throughput multiplier applied before converting to electrons.
   * Use 1 for "no effect". Values <= 0 effectively remove electron signal (degenerate).
   */
  throughput?: number;

  photonNoise?: {
    enabled?: boolean;
    /**
     * Threshold in expected electrons above which a Gaussian approximation may be used
     * instead of exact Poisson sampling.
     */
    gaussianApproxMinElectrons?: number;
  };

  readNoise?: {
    enabled?: boolean;
    /** Gaussian read noise standard deviation [e- RMS] per exposure. */
    sigmaElectrons?: number;
  };

  correlatedNoise?: {
    enabled?: boolean;
    /** OU/AR(1) stationary RMS amplitude in flux units (additive). */
    sigmaFlux?: number;
    /** OU correlation timescale tau [s]. Larger => "redder" noise. */
    tauSec?: number;

    /**
     * Optional 1/f-ish composite: sum of K OU components with log-spaced taus.
     * Interpretation: total stationary RMS is approximately sigmaFlux (when components are independent).
     */
    oneOverF?: {
      enabled?: boolean;
      /** Total stationary RMS in flux units of the composite. */
      sigmaFlux?: number;
      /** Number of OU components (typical 4..10). */
      nComponents?: number;
      /** Minimum correlation timescale [s]. */
      tauMinSec?: number;
      /** Maximum correlation timescale [s]. */
      tauMaxSec?: number;
    };
  };

  trends?: {
    enabled?: boolean;

    roll?: {
      enabled?: boolean;
      /** Roll-induced periodic modulation amplitude (peak) in flux units (additive). */
      ampFlux?: number;
      /** Roll period [s]. */
      periodSec?: number;
      /** Phase offset [rad]. */
      phase0?: number;
    };

    temperature?: {
      enabled?: boolean;
      /** Linear drift slope in flux units per second (additive). */
      linearSlopeFluxPerSec?: number;
      /** Random walk strength in flux units per sqrt(second) (additive). */
      randomWalkSigmaFluxPerSqrtSec?: number;
      /**
       * If true, reset the temperature random-walk accumulator when this feature is disabled.
       * Default behavior is typically "false" to preserve continuity unless explicitly requested.
       */
      resetOnDisable?: boolean;
    };

    intraPixel?: {
      enabled?: boolean;
      /** Pixel-phase modulation amplitude (peak) in flux units (additive). */
      ampFlux?: number;
      /**
       * Toy centroid motion parameters in pixel fractions:
       * x(t)=ax*sin(2π t/Px), y(t)=ay*sin(2π t/Py + phaseY)
       */
      ax?: number;
      ay?: number;
      periodXSec?: number;
      periodYSec?: number;
      /** Phase offset for Y motion [rad]. */
      phaseY?: number;
    };

    driftFamilies?: {
      enabled?: boolean;
      /** Additive amplitudes in flux units for each drift component. */
      amplitudesFlux?: number[];
      /** Component periods [s], aligned by index with amplitudesFlux. */
      periodsSec?: number[];
      /** Optional phase offsets [rad], aligned by index with amplitudesFlux. */
      phasesRad?: number[];
    };
  };

  detector?: {
    enabled?: boolean;
    /**
     * Quadratic non-linearity coefficient in electron domain:
     * e_out = e_in * (1 - coeff * e_in), clamped to >=0.
     */
    nonlinearityCoeff?: number;
    /** Saturation level [e-]. Values above are clipped. */
    saturationElectrons?: number;
    /** Pixel-response non-uniformity sigma (dimensionless, multiplicative around 1). */
    prnuSigma?: number;
    /** Pointing jitter sigma in pixel units (mapped to additive flux modulation). */
    jitterSigmaPx?: number;
    /** CTI-like trailing coefficient (dimensionless, small positive). */
    ctiTrailCoeff?: number;
  };

  /**
   * Observer-side contamination and missing-data controls.
   * These operate on the measured flux after the astrophysical scene is formed,
   * but before any optional detrending/post-processing.
   */
  observer?: {
    enabled?: boolean;

    dataGaps?: {
      enabled?: boolean;
      /** Explicit missing-data windows on the measurement timeline [s]. */
      windowsSec?: Array<{
        startSec?: number;
        endSec?: number;
      }>;
      /** Periodic duty-cycle gap contract for repeated missing observations. */
      periodic?: {
        enabled?: boolean;
        periodSec?: number;
        gapDurationSec?: number;
        phaseSec?: number;
      };
    };

    atmosphere?: {
      enabled?: boolean;

      airmass?: {
        enabled?: boolean;
        /** Base airmass at t=0. */
        base?: number;
        /** Linear time drift in airmass per second. */
        linearPerSec?: number;
        /** Optional curvature term in airmass per second squared. */
        curvaturePerSec2?: number;
        /** Lower clamp for bounded didactic behavior. */
        min?: number;
        /** Upper clamp for bounded didactic behavior. */
        max?: number;
        /** Scalar extinction coefficient in optical-depth units per airmass. */
        extinctionCoeff?: number;
      };

      scintillation?: {
        enabled?: boolean;
        /** RMS multiplicative fluctuation in flux units at airmass 1 and 1 s exposure. */
        sigmaFlux?: number;
        /** Power-law scaling with airmass. */
        airmassExponent?: number;
        /** Power-law scaling with exposure time in the denominator. */
        exposureExponent?: number;
      };

      clouds?: {
        enabled?: boolean;
        /** Mean cloud optical depth contribution. */
        meanOpticalDepth?: number;
        /** OU-driven cloud optical-depth RMS. */
        sigmaOpticalDepth?: number;
        /** OU correlation timescale [s]. */
        tauSec?: number;
      };

      seeing?: {
        enabled?: boolean;
        /** Mean fractional aperture loss. */
        meanLoss?: number;
        /** OU-driven loss RMS. */
        sigmaLoss?: number;
        /** OU correlation timescale [s]. */
        tauSec?: number;
        /** Optional power-law scaling with airmass. */
        airmassExponent?: number;
        /** Safety clamp for the fractional loss term. */
        maxLoss?: number;
      };

      tellurics?: {
        enabled?: boolean;
        /** Mean telluric optical depth contribution. */
        meanOpticalDepth?: number;
        /** OU-driven telluric optical-depth RMS. */
        sigmaOpticalDepth?: number;
        /** OU correlation timescale [s]. */
        tauSec?: number;
        /** Additional scaling applied with (airmass - 1). */
        airmassCoupling?: number;
      };

      skyBackground?: {
        enabled?: boolean;
        /** Mean sky-background electron rate [e-/s]. */
        electronsPerSec?: number;
        /**
         * Fraction of the mean background left after subtraction.
         * 0 = perfect mean subtraction, >0 leaves a positive residual bias.
         */
        subtractionResidualFraction?: number;
      };
    };
  };

  /**
   * Optional post-processing applied to the measured time series.
   * This is intentionally bounded and didactic rather than a full pipeline model.
   */
  postprocess?: {
    enabled?: boolean;
    detrend?: {
      enabled?: boolean;
      mode?: "running-mean" | "linear";
      windowSec?: number;
      minSamples?: number;
      maxHistorySamples?: number;
      /** If true, re-center the detrended output around unity. */
      preserveBaseline?: boolean;
    };
  };

  /** Optional safety clamp of the returned flux value. */
  clampFlux?: { enabled?: boolean; min?: number; max?: number };
};
