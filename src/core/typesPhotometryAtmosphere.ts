export type AtmosphereTransmissionParams = {
  enabled?: boolean;
  target?: "planet" | "moon";
  r0?: number;
  kind?: "hard" | "exponential-halo" | "custom";
  H?: number;
  tau0?: number;
  lambdaNm?: number[];
  tauScale?: number[];
};

export type ForwardScatteringParams = {
  enabled?: boolean;
  amp?: number;
  kind?: "hg-angle" | "gaussian-time";
  g?: number;
  sigmaPhase?: number;
  phaseOffset?: number;
  clampNonNegative?: boolean;
  gateWhenBehindStar?: boolean;
};

export type SpectralBandpassParams = {
  enabled?: boolean;
  lambdaNm?: number[];
  weights?: number[];
};

export type SpectralGaussianFeatureParams = {
  enabled?: boolean;
  centerNm?: number[];
  widthNm?: number[];
  strength?: number[];
};

export type AtmosphereRTLayer = {
  r0: number;
  H: number;
  tau0: number;
  alpha?: number;
  cloudOpacity?: number;
  hazeSlope?: number;
  temperatureK?: number;
};

export type AtmosphereRTParams = {
  enabled?: boolean;
  target?: "planet" | "moon";
  lambdaRefNm?: number;
  layers?: AtmosphereRTLayer[];
  temperatureProfileK?: number[];
  scattering?: {
    enabled?: boolean;
    gain?: number;
    g?: number;
  };
  emission?: {
    enabled?: boolean;
    amp?: number;
    phaseLag?: number;
  };
  cloudHaze?: {
    enabled?: boolean;
    cloudDeckTau?: number;
    hazeTau?: number;
    hazeSlope?: number;
  };
  molecularFeatures?: SpectralGaussianFeatureParams;
  spectralContamination?: SpectralGaussianFeatureParams;
  refraction?: {
    enabled?: boolean;
    amp?: number;
    width?: number;
    chromaticSlope?: number;
  };
};
