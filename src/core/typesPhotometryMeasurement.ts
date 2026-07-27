/**
 * Owns types Photometry Measurement support within the core layer. Keeps shared domain contracts independent of application and simulation orchestration.
 */
import type { InstrumentNoiseSystematicsParams } from "./instrumentNoiseTypes";
import type { LimbDarkeningModel } from "./typesLimbDarkening";
import type {
  AtmosphereRTParams,
  AtmosphereTransmissionParams,
  ForwardScatteringParams,
  SpectralBandpassParams,
} from "./typesPhotometryAtmosphere";
import type {
  AdditiveCompositionMode,
  DayNightVisibilityParams,
  PhaseCurveParams,
  RingScatteringParams,
  ThermalModelAdvancedParams,
} from "./typesPhotometryPhase";
import type {
  BrightnessPatch,
  SpotEvolutionParams,
  StellarSurfaceParams,
  StellarVariabilityParams,
} from "./typesPhotometrySurface";

export type PhotometryParams = {
  baselineFlux?: number;
  limbDarkeningModel?: LimbDarkeningModel;
  brightnessPatches?: BrightnessPatch[];
  cadenceSec?: number;
  nSubsamples?: number;
  phaseCurve?: PhaseCurveParams;
  moonPhaseCurve?: PhaseCurveParams;
  dayNightVisibility?: DayNightVisibilityParams;
  forwardScattering?: ForwardScatteringParams;
  atmosphereTransmission?: AtmosphereTransmissionParams;
  stellarVariability?: StellarVariabilityParams;
  gridRes?: number;
  spotEvolution?: SpotEvolutionParams;
  stellarSurface?: StellarSurfaceParams;
  atmosphereRT?: AtmosphereRTParams;
  spectralBandpass?: SpectralBandpassParams;
  thermalModelAdvanced?: ThermalModelAdvancedParams;
  ringScattering?: RingScatteringParams;
  additiveComposition?: AdditiveCompositionMode;
  instrument?: InstrumentNoiseSystematicsParams;
  instrumentNoise?: InstrumentNoiseSystematicsParams;
};
