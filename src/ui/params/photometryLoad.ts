import type {
  BrightnessPatch,
  PhotometryParams,
  PhaseCurveParams,
  SystemParams,
  ThermalInertiaParams,
} from "../../core/types";
import { sanitizePositive, writeNumberInput } from "../inputs";
import type { UiRefs } from "../refs";
import { formatNumberList, formatQuadraticBands, getQuadraticLDFromModel } from "./common";

type DefaultPatchInputs = {
  p1x: number;
  p1y: number;
  p1r: number;
  p1f: number;
  p2x: number;
  p2y: number;
  p2rx: number;
  p2ry: number;
  p2angle: number;
  p2f: number;
};

const EMPTY_PHASE_CURVE: PhaseCurveParams = {};
const EMPTY_THERMAL_INERTIA: ThermalInertiaParams = {};

const roundPatchLength = (v: number): number => Math.round(v / 1e6) * 1e6;

const valueOr = <T>(value: T | undefined, fallback: T): T => (value === undefined ? fallback : value);

const defaultPatchInputs = (starRadius: number): DefaultPatchInputs => {
  const rStar = Math.max(1, starRadius);
  return {
    p1x: roundPatchLength(-0.28 * rStar),
    p1y: roundPatchLength(0.22 * rStar),
    p1r: roundPatchLength(0.16 * rStar),
    p1f: 0.75,
    p2x: roundPatchLength(0.33 * rStar),
    p2y: roundPatchLength(-0.17 * rStar),
    p2rx: roundPatchLength(0.21 * rStar),
    p2ry: roundPatchLength(0.09 * rStar),
    p2angle: 0.6,
    p2f: 1.12,
  };
};

const patchNumber = (
  patch: BrightnessPatch | undefined,
  key: "x" | "y" | "r" | "rx" | "ry" | "angle" | "factor",
  fallback: number,
): number => valueOr(patch?.[key], fallback);

const loadPhotometryBasics = (ph: PhotometryParams, r: UiRefs): void => {
  writeNumberInput(r.baselineFlux, valueOr(ph.baselineFlux, 1.0));
  writeNumberInput(r.gridRes, valueOr(ph.gridRes, 220));
};

const loadLimbDarkeningIntoUI = (ph: PhotometryParams, r: UiRefs): void => {
  const model = ph.limbDarkeningModel;
  const qld = getQuadraticLDFromModel(model);
  r.ldEnabled.checked = Boolean(model);
  writeNumberInput(r.ldU1, qld?.u1 ?? 0.35);
  writeNumberInput(r.ldU2, qld?.u2 ?? 0.25);
  r.ldBandpass.value = String(model?.bandpass ?? "");
  r.ldBands.value = formatQuadraticBands(model?.bands);
};

const loadPrimaryPatchIntoUI = (
  patch: BrightnessPatch | undefined,
  defaults: DefaultPatchInputs,
  r: UiRefs,
): void => {
  writeNumberInput(r.p1x, patchNumber(patch, "x", defaults.p1x));
  writeNumberInput(r.p1y, patchNumber(patch, "y", defaults.p1y));
  writeNumberInput(r.p1r, patchNumber(patch, "r", defaults.p1r));
  writeNumberInput(r.p1f, patchNumber(patch, "factor", defaults.p1f));
};

const loadSecondaryPatchIntoUI = (
  patch: BrightnessPatch | undefined,
  defaults: DefaultPatchInputs,
  r: UiRefs,
): void => {
  writeNumberInput(r.p2x, patchNumber(patch, "x", defaults.p2x));
  writeNumberInput(r.p2y, patchNumber(patch, "y", defaults.p2y));
  writeNumberInput(r.p2rx, patchNumber(patch, "rx", defaults.p2rx));
  writeNumberInput(r.p2ry, patchNumber(patch, "ry", defaults.p2ry));
  writeNumberInput(r.p2angle, patchNumber(patch, "angle", defaults.p2angle));
  writeNumberInput(r.p2f, patchNumber(patch, "factor", defaults.p2f));
};

const loadBrightnessPatchesIntoUI = (p: SystemParams, ph: PhotometryParams, r: UiRefs): void => {
  const patches = ph.brightnessPatches ?? [];
  const patchDefaults = defaultPatchInputs(sanitizePositive(p.star.r, 1, 1e12));
  r.patchesEnabled.checked = patches.length > 0;
  loadPrimaryPatchIntoUI(patches[0], patchDefaults, r);
  loadSecondaryPatchIntoUI(patches[1], patchDefaults, r);
};

const loadSpotEvolutionIntoUI = (ph: PhotometryParams, r: UiRefs): void => {
  const spot = valueOr(ph.spotEvolution, {});
  r.spotEvolutionEnabled.checked = Boolean(spot.enabled);
  writeNumberInput(r.spotRotationPeriod, valueOr(spot.rotationPeriodSec, 20000));
  writeNumberInput(r.spotCoverage, valueOr(spot.coverage, 1));
  writeNumberInput(r.spotLifetime, valueOr(spot.lifetimeSec, 0));
  writeNumberInput(r.spotDriftRate, valueOr(spot.driftRateRadPerSec, 0));
};

const loadThermalInertiaIntoUI = (
  target: "planet" | "moon",
  thermal: ThermalInertiaParams,
  r: UiRefs,
): void => {
  const enabled = Boolean(thermal.enabled);
  const albedo = valueOr(thermal.albedo, 0);
  const emissivity = valueOr(thermal.emissivity, 1);
  const timescale = valueOr(thermal.thermalTimescaleSec, 0);
  const redistribution = valueOr(thermal.redistribution, 0);
  if (target === "planet") {
    r.planetThermalInertiaEnabled.checked = enabled;
    writeNumberInput(r.planetAlbedo, albedo);
    writeNumberInput(r.planetEmissivity, emissivity);
    writeNumberInput(r.planetThermalTimescale, timescale);
    writeNumberInput(r.planetRedistribution, redistribution);
    return;
  }
  r.moonThermalInertiaEnabled.checked = enabled;
  writeNumberInput(r.moonAlbedo, albedo);
  writeNumberInput(r.moonEmissivity, emissivity);
  writeNumberInput(r.moonThermalTimescale, timescale);
  writeNumberInput(r.moonRedistribution, redistribution);
};

const loadPlanetPhaseIntoUI = (ph: PhotometryParams, r: UiRefs): void => {
  const phase = valueOr(ph.phaseCurve, EMPTY_PHASE_CURVE);
  r.planetPhaseEnabled.checked = Boolean(phase.enabled);
  writeNumberInput(r.planetReflAmp, valueOr(phase.reflAmp, 0.001));
  writeNumberInput(r.planetThermAmp, valueOr(phase.thermAmp, 0.0005));
  writeNumberInput(r.planetReflOffset, valueOr(phase.reflOffset, 0));
  writeNumberInput(r.planetThermOffset, valueOr(phase.thermOffset, 0));
  r.planetLambertian.checked = Boolean(valueOr(phase.lambertian, true));
  writeNumberInput(r.planetConstant, valueOr(phase.constant, 0));
  loadThermalInertiaIntoUI("planet", valueOr(phase.thermalInertia, EMPTY_THERMAL_INERTIA), r);
};

const loadForwardScatteringIntoUI = (ph: PhotometryParams, r: UiRefs): void => {
  const scattering = valueOr(ph.forwardScattering, {});
  r.fsEnabled.checked = Boolean(scattering.enabled);
  writeNumberInput(r.fsAmp, valueOr(scattering.amp, 0));
  writeNumberInput(r.fsG, valueOr(scattering.g, 0.8));
  writeNumberInput(r.fsSigma, valueOr(scattering.sigmaPhase, 0.12));
  writeNumberInput(r.fsOffset, valueOr(scattering.phaseOffset, 0));
  r.fsGateBehind.checked = Boolean(valueOr(scattering.gateWhenBehindStar, true));
};

const loadAtmosphereTransmissionIntoUI = (ph: PhotometryParams, r: UiRefs): void => {
  const atmosphere = valueOr(ph.atmosphereTransmission, {});
  r.atmEnabled.checked = Boolean(atmosphere.enabled);
  r.atmKind.value = String(valueOr(atmosphere.kind, "hard"));
  writeNumberInput(r.atmR0, valueOr(atmosphere.r0, 0));
  writeNumberInput(r.atmH, valueOr(atmosphere.H, 0));
  writeNumberInput(r.atmTau0, valueOr(atmosphere.tau0, 0));
  r.atmLambdaNm.value = formatNumberList(atmosphere.lambdaNm);
  r.atmTauScale.value = formatNumberList(atmosphere.tauScale);
};

const loadMoonPhaseIntoUI = (ph: PhotometryParams, r: UiRefs): void => {
  const phase = valueOr(ph.moonPhaseCurve, EMPTY_PHASE_CURVE);
  r.moonPhaseEnabled.checked = Boolean(phase.enabled);
  writeNumberInput(r.moonReflAmp, valueOr(phase.reflAmp, 0));
  writeNumberInput(r.moonThermAmp, valueOr(phase.thermAmp, 0));
  r.moonLambertian.checked = Boolean(valueOr(phase.lambertian, true));
  // Moon reflOffset / thermOffset have no dedicated inputs; read keeps them.
  loadThermalInertiaIntoUI("moon", valueOr(phase.thermalInertia, EMPTY_THERMAL_INERTIA), r);
};

const loadSmearingIntoUI = (ph: PhotometryParams, r: UiRefs): void => {
  r.smearEnabled.checked = valueOr(ph.cadenceSec, 0) > 0;
  writeNumberInput(r.cadenceSec, valueOr(ph.cadenceSec, 60));
  writeNumberInput(r.nSubsamples, valueOr(ph.nSubsamples, 9));
};

const loadStellarVariabilityIntoUI = (ph: PhotometryParams, r: UiRefs): void => {
  const variability = valueOr(ph.stellarVariability, {});
  r.varEnabled.checked = Boolean(variability.enabled);
  writeNumberInput(r.beamingAmp, valueOr(variability.beamingAmp, 0));
  writeNumberInput(r.ellipsoidalAmp, valueOr(variability.ellipsoidalAmp, 0));
  writeNumberInput(r.beamingOffset, valueOr(variability.beamingOffset, 0));
  writeNumberInput(r.ellipsoidalOffset, valueOr(variability.ellipsoidalOffset, 0));
  writeNumberInput(r.varConstant, valueOr(variability.constant, 0));
};

const loadDayNightIntoUI = (ph: PhotometryParams, r: UiRefs): void => {
  const dayNight = valueOr(ph.dayNightVisibility, {});
  r.dnEnabled.checked = Boolean(dayNight.enabled);
  r.dnClamp.checked = Boolean(valueOr(dayNight.clamp, true));
  r.dnReflectedModel.value = String(valueOr(dayNight.reflectedModel, "lambert"));
  r.dnThermalModel.value = String(valueOr(dayNight.thermalModel, "constant"));
};

export const loadPhotometryIntoUI = (p: SystemParams, r: UiRefs): void => {
  const ph = p.star.photometry ?? {};
  loadPhotometryBasics(ph, r);
  loadLimbDarkeningIntoUI(ph, r);
  loadBrightnessPatchesIntoUI(p, ph, r);
  loadSpotEvolutionIntoUI(ph, r);
  loadPlanetPhaseIntoUI(ph, r);
  loadForwardScatteringIntoUI(ph, r);
  loadAtmosphereTransmissionIntoUI(ph, r);
  loadMoonPhaseIntoUI(ph, r);
  loadSmearingIntoUI(ph, r);
  loadStellarVariabilityIntoUI(ph, r);
  loadDayNightIntoUI(ph, r);
};
