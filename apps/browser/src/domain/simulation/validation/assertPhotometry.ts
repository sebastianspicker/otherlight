/**
 * Owns assert Photometry support within the sim layer. Keeps simulation state and numerical execution separate from UI coordination.
 */
import type {
  AtmosphereRTLayer,
  AtmosphereRTParams,
  ForwardScatteringParams,
  PhaseCurveParams,
  PhotometryParams,
  RingScatteringParams,
  SpectralBandpassParams,
  SpotEvolutionParams,
  StellarSurfaceParams,
  BrowserScenarioDraft,
  ThermalInertiaParams,
  ThermalModelAdvancedParams,
} from "../../model/types";
import { isFiniteNonNegative } from "../../model/units";

const usesHigherFidelityAdditiveComposition = (params: BrowserScenarioDraft): boolean => {
  const fid = params.dynamics?.fidelityProfile;
  return fid === "accurate" || fid === "reference";
};

const isFinitePositive = (value: unknown): boolean => {
  return Number.isFinite(value) && (value as number) > 0;
};

const isFiniteUnitInterval = (value: unknown): boolean => {
  return Number.isFinite(value) && (value as number) >= 0 && (value as number) <= 1;
};

const hasActiveThermalPhaseChannel = (
  model: PhaseCurveParams | undefined,
  params: BrowserScenarioDraft,
): boolean => {
  if (!model?.enabled) return false;
  if (isFinitePositive(model.thermAmp)) return true;
  if (isFinitePositive(model.constant)) return true;
  return Boolean(params.star.photometry?.thermalModelAdvanced?.enabled);
};

const hasActiveReflectedPhaseChannel = (model: PhaseCurveParams | undefined): boolean => {
  return Boolean(model?.enabled && isFinitePositive(model.reflAmp));
};

const hasActiveForwardScattering = (phot: PhotometryParams | undefined): boolean => {
  return Boolean(phot?.forwardScattering?.enabled && isFinitePositive(phot.forwardScattering.amp));
};

const hasActiveRingScattering = (phot: PhotometryParams | undefined): boolean => {
  return Boolean(phot?.ringScattering?.enabled && isFinitePositive(phot.ringScattering.amp));
};

const hasActiveRtEmission = (phot: PhotometryParams | undefined): boolean => {
  const emission = phot?.atmosphereRT?.emission;
  return Boolean(phot?.atmosphereRT?.enabled && emission?.enabled && isFinitePositive(emission.amp));
};

const hasActiveHigherFidelityAdditiveChannels = (params: BrowserScenarioDraft): boolean => {
  const phot = params.star.photometry;
  return Boolean(
    phot?.phaseCurve?.enabled ||
      phot?.moonPhaseCurve?.enabled ||
      hasActiveForwardScattering(phot) ||
      hasActiveRingScattering(phot) ||
      hasActiveRtEmission(phot),
  );
};

const assertPhotometryGridRes = (phot: PhotometryParams | undefined): void => {
  const gridRes = phot?.gridRes;
  if (gridRes !== undefined && (!Number.isFinite(gridRes) || gridRes <= 0)) {
    throw new Error("star.photometry.gridRes must be > 0 and finite if provided.");
  }
};

const assertPhotometryBaselineFlux = (phot: PhotometryParams | undefined): void => {
  const baselineFlux = phot?.baselineFlux;
  if (baselineFlux !== undefined && !isFiniteNonNegative(baselineFlux)) {
    throw new Error("star.photometry.baselineFlux must be finite and >= 0 if provided.");
  }
};

const assertPhotometryCadence = (phot: PhotometryParams | undefined): void => {
  const cadenceSec = phot?.cadenceSec;
  if (cadenceSec !== undefined && !isFiniteNonNegative(cadenceSec)) {
    throw new Error("star.photometry.cadenceSec must be finite and >= 0 if provided.");
  }
};

const assertPhotometrySubsamples = (phot: PhotometryParams | undefined): void => {
  const nSubsamples = phot?.nSubsamples;
  if (nSubsamples !== undefined && (!Number.isFinite(nSubsamples) || nSubsamples < 1)) {
    throw new Error("star.photometry.nSubsamples must be finite and >= 1 if provided.");
  }
};

const assertBasicPhotometry = (phot: PhotometryParams | undefined): void => {
  assertPhotometryGridRes(phot);
  assertPhotometryBaselineFlux(phot);
  assertPhotometryCadence(phot);
  assertPhotometrySubsamples(phot);
};

const assertThermalInertiaAlbedo = (thermalInertia: ThermalInertiaParams, name: string): void => {
  if (thermalInertia.albedo !== undefined && !isFiniteUnitInterval(thermalInertia.albedo)) {
    throw new Error(`${name}.albedo must be in [0,1] if provided.`);
  }
};

const assertThermalInertiaEmissivity = (thermalInertia: ThermalInertiaParams, name: string): void => {
  if (thermalInertia.emissivity !== undefined && !isFiniteUnitInterval(thermalInertia.emissivity)) {
    throw new Error(`${name}.emissivity must be in [0,1] if provided.`);
  }
};

const assertThermalInertiaTimescale = (thermalInertia: ThermalInertiaParams, name: string): void => {
  if (
    thermalInertia.thermalTimescaleSec !== undefined &&
    (!Number.isFinite(thermalInertia.thermalTimescaleSec) || thermalInertia.thermalTimescaleSec < 0)
  ) {
    throw new Error(`${name}.thermalTimescaleSec must be >= 0 if provided.`);
  }
};

const assertThermalInertiaRedistribution = (thermalInertia: ThermalInertiaParams, name: string): void => {
  if (thermalInertia.redistribution !== undefined && !isFiniteUnitInterval(thermalInertia.redistribution)) {
    throw new Error(`${name}.redistribution must be in [0,1] if provided.`);
  }
};

const assertThermalInertia = (thermalInertia: ThermalInertiaParams | undefined, name: string): void => {
  if (!thermalInertia?.enabled) return;
  assertThermalInertiaAlbedo(thermalInertia, name);
  assertThermalInertiaEmissivity(thermalInertia, name);
  assertThermalInertiaTimescale(thermalInertia, name);
  assertThermalInertiaRedistribution(thermalInertia, name);
};

const assertPhaseCurveThermalInertia = (phot: PhotometryParams | undefined): void => {
  assertThermalInertia(phot?.phaseCurve?.thermalInertia, "phaseCurve.thermalInertia");
  assertThermalInertia(phot?.moonPhaseCurve?.thermalInertia, "moonPhaseCurve.thermalInertia");
};

const assertSpotRotation = (spot: SpotEvolutionParams): void => {
  const period = spot.rotationPeriodSec ?? Number.NaN;
  if (!Number.isFinite(period) || period <= 0) {
    throw new Error("star.photometry.spotEvolution.rotationPeriodSec must be > 0 when enabled.");
  }
};

const assertSpotCoverage = (spot: SpotEvolutionParams): void => {
  if (spot.coverage !== undefined && !isFiniteUnitInterval(spot.coverage)) {
    throw new Error("star.photometry.spotEvolution.coverage must be in [0,1] if provided.");
  }
};

const assertSpotTiming = (spot: SpotEvolutionParams): void => {
  if (spot.lifetimeSec !== undefined && (!Number.isFinite(spot.lifetimeSec) || spot.lifetimeSec < 0)) {
    throw new Error("star.photometry.spotEvolution.lifetimeSec must be >= 0 if provided.");
  }
  if (spot.driftRateRadPerSec !== undefined && !Number.isFinite(spot.driftRateRadPerSec)) {
    throw new Error("star.photometry.spotEvolution.driftRateRadPerSec must be finite if provided.");
  }
  if (spot.tRef !== undefined && !Number.isFinite(spot.tRef)) {
    throw new Error("star.photometry.spotEvolution.tRef must be finite if provided.");
  }
};

const assertSpotPhase = (spot: SpotEvolutionParams): void => {
  if (spot.rotationPhase0 !== undefined && !Number.isFinite(spot.rotationPhase0)) {
    throw new Error("star.photometry.spotEvolution.rotationPhase0 must be finite if provided.");
  }
};

const assertSpotEvolution = (spot: SpotEvolutionParams | undefined): void => {
  if (!spot?.enabled) return;
  assertSpotRotation(spot);
  assertSpotCoverage(spot);
  assertSpotTiming(spot);
  assertSpotPhase(spot);
};

const assertStellarSurface = (surface: StellarSurfaceParams | undefined): void => {
  if (!surface?.enabled) return;
  if (surface.differentialRotationK !== undefined && !isFiniteUnitInterval(surface.differentialRotationK)) {
    throw new Error("star.photometry.stellarSurface.differentialRotationK must be in [0,1] if provided.");
  }
  if (
    surface.rotationPeriodSec !== undefined &&
    (!Number.isFinite(surface.rotationPeriodSec) || surface.rotationPeriodSec <= 0)
  ) {
    throw new Error("star.photometry.stellarSurface.rotationPeriodSec must be finite and > 0 if provided.");
  }
};

const numericArray = (value: unknown): unknown[] => {
  return Array.isArray(value) ? value : [];
};

const hasInvalidPositiveEntry = (values: unknown[]): boolean => {
  return values.some((x) => !Number.isFinite(x) || (x as number) <= 0);
};

const hasInvalidNonNegativeEntry = (values: unknown[]): boolean => {
  return values.some((x) => !Number.isFinite(x) || (x as number) < 0);
};

const assertSpectralBandpassEntries = (lambda: unknown[], weights: unknown[]): void => {
  if (lambda.length > 0 && hasInvalidPositiveEntry(lambda)) {
    throw new Error("star.photometry.spectralBandpass.lambdaNm entries must be finite and > 0.");
  }
  if (weights.length > 0 && hasInvalidNonNegativeEntry(weights)) {
    throw new Error("star.photometry.spectralBandpass.weights entries must be finite and >= 0.");
  }
};

const assertSpectralBandpassWeights = (lambda: unknown[], weights: unknown[]): void => {
  if (weights.length > 0 && weights.length !== lambda.length) {
    throw new Error("star.photometry.spectralBandpass.weights must match lambdaNm length when provided.");
  }
};

const assertSpectralBandpass = (bp: SpectralBandpassParams | undefined): void => {
  if (!bp?.enabled) return;
  const lambda = numericArray(bp.lambdaNm);
  const weights = numericArray(bp.weights);
  assertSpectralBandpassEntries(lambda, weights);
  assertSpectralBandpassWeights(lambda, weights);
};

const assertAtmosphereRtReference = (rt: AtmosphereRTParams): void => {
  if (rt.lambdaRefNm !== undefined && (!Number.isFinite(rt.lambdaRefNm) || rt.lambdaRefNm <= 0)) {
    throw new Error("star.photometry.atmosphereRT.lambdaRefNm must be finite and > 0 if provided.");
  }
};

const assertAtmosphereRtLayerGeometry = (layer: AtmosphereRTLayer, index: number): void => {
  if (!Number.isFinite(layer.r0) || layer.r0 <= 0) {
    throw new Error(`star.photometry.atmosphereRT.layers[${index}].r0 must be finite and > 0.`);
  }
  if (!Number.isFinite(layer.H) || layer.H <= 0) {
    throw new Error(`star.photometry.atmosphereRT.layers[${index}].H must be finite and > 0.`);
  }
};

const assertAtmosphereRtLayerOpticalDepth = (layer: AtmosphereRTLayer, index: number): void => {
  if (!Number.isFinite(layer.tau0) || layer.tau0 < 0) {
    throw new Error(`star.photometry.atmosphereRT.layers[${index}].tau0 must be finite and >= 0.`);
  }
  if (layer.alpha !== undefined && !Number.isFinite(layer.alpha)) {
    throw new Error(`star.photometry.atmosphereRT.layers[${index}].alpha must be finite if provided.`);
  }
};

const assertAtmosphereRtLayer = (layer: AtmosphereRTLayer, index: number): void => {
  assertAtmosphereRtLayerGeometry(layer, index);
  assertAtmosphereRtLayerOpticalDepth(layer, index);
};

const assertAtmosphereRtLayers = (rt: AtmosphereRTParams): void => {
  const layers = Array.isArray(rt.layers) ? rt.layers : [];
  for (let index = 0; index < layers.length; index++) {
    assertAtmosphereRtLayer(layers[index], index);
  }
};

const assertAtmosphereRt = (rt: AtmosphereRTParams | undefined): void => {
  if (!rt?.enabled) return;
  assertAtmosphereRtReference(rt);
  assertAtmosphereRtLayers(rt);
};

const assertThermalModelScale = (model: ThermalModelAdvancedParams): void => {
  if (
    model.equilibriumScale !== undefined &&
    (!Number.isFinite(model.equilibriumScale) || model.equilibriumScale < 0)
  ) {
    throw new Error(
      "star.photometry.thermalModelAdvanced.equilibriumScale must be finite and >= 0 if provided.",
    );
  }
};

const assertThermalModelRedistribution = (model: ThermalModelAdvancedParams): void => {
  if (model.redistribution !== undefined && !isFiniteUnitInterval(model.redistribution)) {
    throw new Error("star.photometry.thermalModelAdvanced.redistribution must be in [0,1] if provided.");
  }
};

const assertThermalModelTau = (model: ThermalModelAdvancedParams): void => {
  if (model.tauSec !== undefined && (!Number.isFinite(model.tauSec) || model.tauSec < 0)) {
    throw new Error("star.photometry.thermalModelAdvanced.tauSec must be finite and >= 0 if provided.");
  }
};

const assertThermalModelAdvanced = (model: ThermalModelAdvancedParams | undefined): void => {
  if (!model?.enabled) return;
  assertThermalModelScale(model);
  assertThermalModelRedistribution(model);
  assertThermalModelTau(model);
};

const assertRingScatteringAmp = (ringScattering: RingScatteringParams): void => {
  if (ringScattering.amp !== undefined && (!Number.isFinite(ringScattering.amp) || ringScattering.amp < 0)) {
    throw new Error("star.photometry.ringScattering.amp must be finite and >= 0 if provided.");
  }
};

const assertRingScatteringSigma = (ringScattering: RingScatteringParams): void => {
  if (
    ringScattering.sigmaPhase !== undefined &&
    (!Number.isFinite(ringScattering.sigmaPhase) || ringScattering.sigmaPhase <= 0)
  ) {
    throw new Error("star.photometry.ringScattering.sigmaPhase must be finite and > 0 if provided.");
  }
};

const assertRingScattering = (ringScattering: RingScatteringParams | undefined): void => {
  if (!ringScattering?.enabled) return;
  assertRingScatteringAmp(ringScattering);
  assertRingScatteringSigma(ringScattering);
};

const assertHigherFidelityOptIn = (
  params: BrowserScenarioDraft,
  phot: PhotometryParams | undefined,
): void => {
  if (
    hasActiveHigherFidelityAdditiveChannels(params) &&
    phot?.additiveComposition !== "higher-fidelity-coupled"
  ) {
    throw new Error(
      'higher-fidelity additive composition requires star.photometry.additiveComposition = "higher-fidelity-coupled" when additive body-light channels are active.',
    );
  }
};

const hasActiveEmissionForTarget = (
  phot: PhotometryParams | undefined,
  target: "planet" | "moon",
): boolean => {
  const emission = phot?.atmosphereRT?.enabled ? phot.atmosphereRT.emission : undefined;
  const rtTarget = phot?.atmosphereRT?.target ?? "planet";
  return rtTarget === target && Boolean(emission?.enabled && isFinitePositive(emission.amp));
};

const assertEmissionThermalConflict = (
  params: BrowserScenarioDraft,
  phot: PhotometryParams | undefined,
): void => {
  if (hasActiveEmissionForTarget(phot, "planet") && hasActiveThermalPhaseChannel(phot?.phaseCurve, params)) {
    throw new Error(
      "higher-fidelity additive composition rejects star.photometry.atmosphereRT.emission together with an active planet thermal phase channel.",
    );
  }
  if (
    hasActiveEmissionForTarget(phot, "moon") &&
    hasActiveThermalPhaseChannel(phot?.moonPhaseCurve, params)
  ) {
    throw new Error(
      "higher-fidelity additive composition rejects star.photometry.atmosphereRT.emission together with an active moon thermal phase channel.",
    );
  }
};

const assertForwardScatteringConflict = (
  forwardScattering: ForwardScatteringParams | undefined,
  phaseCurve: PhaseCurveParams | undefined,
): void => {
  if (
    forwardScattering?.enabled &&
    isFinitePositive(forwardScattering.amp) &&
    hasActiveReflectedPhaseChannel(phaseCurve)
  ) {
    throw new Error(
      "higher-fidelity additive composition rejects star.photometry.forwardScattering together with an active reflected planet phase channel.",
    );
  }
};

const assertRingScatteringConflict = (
  params: BrowserScenarioDraft,
  phot: PhotometryParams | undefined,
): void => {
  if (
    hasActiveRingScattering(phot) &&
    params.planet.rings &&
    hasActiveReflectedPhaseChannel(phot?.phaseCurve)
  ) {
    throw new Error(
      "higher-fidelity additive composition rejects star.photometry.ringScattering together with an active reflected planet phase channel.",
    );
  }
};

const assertHigherFidelityAdditiveComposition = (
  params: BrowserScenarioDraft,
  phot: PhotometryParams | undefined,
): void => {
  assertHigherFidelityOptIn(params, phot);
  assertEmissionThermalConflict(params, phot);
  assertForwardScatteringConflict(phot?.forwardScattering, phot?.phaseCurve);
  assertRingScatteringConflict(params, phot);
};

export function assertPhotometryInputs(params: BrowserScenarioDraft): void {
  const phot = params.star.photometry;
  assertBasicPhotometry(phot);
  assertPhaseCurveThermalInertia(phot);
  assertSpotEvolution(phot?.spotEvolution);
  assertStellarSurface(phot?.stellarSurface);
  assertSpectralBandpass(phot?.spectralBandpass);
  assertAtmosphereRt(phot?.atmosphereRT);
  assertThermalModelAdvanced(phot?.thermalModelAdvanced);
  assertRingScattering(phot?.ringScattering);

  if (!usesHigherFidelityAdditiveComposition(params)) return;
  assertHigherFidelityAdditiveComposition(params, phot);
}
