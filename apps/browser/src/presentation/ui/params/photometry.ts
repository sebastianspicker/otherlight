/**
 * Owns photometry support within the ui layer. Keeps DOM-facing behavior separate from application orchestration.
 */
import type {
  AtmosphereTransmissionParams,
  BrightnessPatch,
  LimbDarkeningModel,
  PhaseCurveParams,
  PhotometryParams,
  BrowserScenarioDraft,
  ThermalInertiaParams,
} from "../../../domain/model/types";
import { clamp } from "../../../domain/model/units";
import {
  MAX_SMEARING_SUBSAMPLES,
  MAX_TRANSIT_GRID_RES,
  MIN_TRANSIT_GRID_RES,
} from "../../../domain/model/transitComputeBudget";
import { readCheckbox, readNumberInput, readSelect, sanitizeFinite, sanitizePositive } from "../inputs";
import type { UiRefs } from "../refs";
import { ensurePhotometry, getQuadraticLDFromModel, parseNumberList, parseQuadraticBands } from "./common";
export { loadPhotometryIntoUI } from "./photometryLoad";

import { defaultPatchInputs } from "./common";

function buildPatchesFromUI(r: UiRefs): BrightnessPatch[] {
  const defaults = defaultPatchInputs(sanitizePositive(readNumberInput(r.starR, 6.957e8), 1, 1e12));
  const patches: BrightnessPatch[] = [];

  patches.push({
    shape: "circle",
    x: sanitizeFinite(readNumberInput(r.p1x, defaults.p1x), defaults.p1x),
    y: sanitizeFinite(readNumberInput(r.p1y, defaults.p1y), defaults.p1y),
    r: sanitizePositive(readNumberInput(r.p1r, defaults.p1r), 0, 1e12),
    factor: sanitizePositive(readNumberInput(r.p1f, defaults.p1f), 0, 1e6),
  });

  patches.push({
    shape: "ellipse",
    x: sanitizeFinite(readNumberInput(r.p2x, defaults.p2x), defaults.p2x),
    y: sanitizeFinite(readNumberInput(r.p2y, defaults.p2y), defaults.p2y),
    rx: sanitizePositive(readNumberInput(r.p2rx, defaults.p2rx), 0, 1e12),
    ry: sanitizePositive(readNumberInput(r.p2ry, defaults.p2ry), 0, 1e12),
    angle: sanitizeFinite(readNumberInput(r.p2angle, defaults.p2angle), defaults.p2angle),
    factor: sanitizePositive(readNumberInput(r.p2f, defaults.p2f), 0, 1e6),
  });

  return patches;
}

type AtmosphereSpectralInputs = {
  lambdaNm?: number[];
  tauScale?: number[];
};

type PositiveLambdaSamples = {
  keepIdx: number[];
  lambdaNm: number[];
};

const EMPTY_PHASE_CURVE: PhaseCurveParams = {};
const EMPTY_THERMAL_INERTIA: ThermalInertiaParams = {};

function finiteOrDefault(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) ? (value as number) : fallback;
}

function valueOr<T>(value: T | undefined, fallback: T): T {
  return value === undefined ? fallback : value;
}

function positiveAtmosphereLambdaSamples(lambdaRaw: number[]): PositiveLambdaSamples {
  const keepIdx: number[] = [];
  const lambdaNm: number[] = [];
  for (let i = 0; i < lambdaRaw.length; i++) {
    const value = lambdaRaw[i];
    if (value > 0) {
      keepIdx.push(i);
      lambdaNm.push(value);
    }
  }
  return { keepIdx, lambdaNm };
}

function tauScaleForSpectralInputs(
  samples: PositiveLambdaSamples,
  lambdaRawLength: number,
  tauRaw: number[],
): number[] | undefined {
  const { keepIdx, lambdaNm } = samples;
  if (tauRaw.length === 0) return undefined;
  if (tauRaw.length === 1) return lambdaNm.map(() => finiteOrDefault(tauRaw[0], 1));
  if (tauRaw.length === lambdaRawLength) {
    return keepIdx.map((index) => finiteOrDefault(tauRaw[index], 1));
  }
  if (tauRaw.length === lambdaNm.length) {
    return tauRaw.map((value) => finiteOrDefault(value, 1));
  }
  return lambdaNm.map(() => 1);
}

function normalizeAtmosphereSpectralInputs(r: UiRefs): AtmosphereSpectralInputs {
  const lambdaRaw = parseNumberList(r.atmLambdaNm.value);
  const samples = positiveAtmosphereLambdaSamples(lambdaRaw);
  if (samples.lambdaNm.length === 0) return { lambdaNm: undefined, tauScale: undefined };

  const tauRaw = parseNumberList(r.atmTauScale.value).map((value) => Math.max(0, value));
  return {
    lambdaNm: samples.lambdaNm,
    tauScale: tauScaleForSpectralInputs(samples, lambdaRaw.length, tauRaw),
  };
}

export function readPhotometryFromUI(next: BrowserScenarioDraft, r: UiRefs): void {
  const ph = ensurePhotometry(next);
  readPhotometryBasics(ph, r);
  readLimbDarkeningFromUI(ph, r);
  readBrightnessPatchesFromUI(ph, r);
  readSpotEvolutionFromUI(ph, r);
  readPlanetPhaseFromUI(ph, r);
  readForwardScatteringFromUI(ph, r);
  readAtmosphereTransmissionFromUI(ph, r);
  readMoonPhaseFromUI(next, ph, r);
  readSmearingFromUI(ph, r);
  readStellarVariabilityFromUI(ph, r);
  readDayNightFromUI(ph, r);
}

function readPhotometryBasics(ph: PhotometryParams, r: UiRefs): void {
  ph.baselineFlux = sanitizePositive(readNumberInput(r.baselineFlux, valueOr(ph.baselineFlux, 1)), 0, 1e9);
  ph.gridRes = Math.floor(
    sanitizePositive(
      readNumberInput(r.gridRes, valueOr(ph.gridRes, 220)),
      MIN_TRANSIT_GRID_RES,
      MAX_TRANSIT_GRID_RES,
    ),
  );
}

function readLimbDarkeningFromUI(ph: PhotometryParams, r: UiRefs): void {
  if (!readCheckbox(r.ldEnabled)) {
    delete ph.limbDarkeningModel;
    return;
  }

  const prevModel = valueOr(ph.limbDarkeningModel, {}) as LimbDarkeningModel;
  const prevQ = getQuadraticLDFromModel(prevModel);
  const u1 = sanitizeFinite(readNumberInput(r.ldU1, valueOr(prevQ?.u1, 0.35)), 0.35);
  const u2 = sanitizeFinite(readNumberInput(r.ldU2, valueOr(prevQ?.u2, 0.25)), 0.25);
  const bandpassRaw = r.ldBandpass.value.trim();
  const bands = readQuadraticBandsFromUI(r);

  ph.limbDarkeningModel = {
    ...prevModel,
    bandpass: bandpassRaw.length > 0 ? bandpassRaw : undefined,
    default: { kind: "quadratic", u1, u2 },
    bands,
  };
}

function readQuadraticBandsFromUI(r: UiRefs): ReturnType<typeof parseQuadraticBands> | undefined {
  const bandsText = valueOr(r.ldBands.value, "");
  return bandsText.trim().length > 0 ? parseQuadraticBands(bandsText) : undefined;
}

function readBrightnessPatchesFromUI(ph: PhotometryParams, r: UiRefs): void {
  if (readCheckbox(r.patchesEnabled)) {
    ph.brightnessPatches = buildPatchesFromUI(r);
    return;
  }
  delete ph.brightnessPatches;
}

function readSpotEvolutionFromUI(ph: PhotometryParams, r: UiRefs): void {
  if (!readCheckbox(r.spotEvolutionEnabled)) {
    delete ph.spotEvolution;
    return;
  }

  const prev = valueOr(ph.spotEvolution, {});
  ph.spotEvolution = {
    enabled: true,
    rotationPeriodSec: sanitizePositive(
      readNumberInput(r.spotRotationPeriod, valueOr(prev.rotationPeriodSec, 20000)),
      1,
      1e12,
    ),
    coverage: clamp(sanitizeFinite(readNumberInput(r.spotCoverage, valueOr(prev.coverage, 1)), 1), 0, 1),
    lifetimeSec: sanitizePositive(readNumberInput(r.spotLifetime, valueOr(prev.lifetimeSec, 0)), 0, 1e12),
    driftRateRadPerSec: sanitizeFinite(
      readNumberInput(r.spotDriftRate, valueOr(prev.driftRateRadPerSec, 0)),
      0,
    ),
    tRef: valueOr(prev.tRef, 0),
    rotationPhase0: valueOr(prev.rotationPhase0, 0),
  };
}

function readPlanetPhaseFromUI(ph: PhotometryParams, r: UiRefs): void {
  if (!readCheckbox(r.planetPhaseEnabled)) {
    delete ph.phaseCurve;
    return;
  }

  const prev = valueOr(ph.phaseCurve, EMPTY_PHASE_CURVE);
  ph.phaseCurve = {
    enabled: true,
    reflAmp: sanitizePositive(readNumberInput(r.planetReflAmp, valueOr(prev.reflAmp, 0)), 0, 10),
    thermAmp: sanitizePositive(readNumberInput(r.planetThermAmp, valueOr(prev.thermAmp, 0)), 0, 10),
    reflOffset: sanitizeFinite(readNumberInput(r.planetReflOffset, valueOr(prev.reflOffset, 0)), 0),
    thermOffset: sanitizeFinite(readNumberInput(r.planetThermOffset, valueOr(prev.thermOffset, 0)), 0),
    lambertian: readCheckbox(r.planetLambertian),
    constant: sanitizePositive(readNumberInput(r.planetConstant, valueOr(prev.constant, 0)), 0, 10),
    physicalScaling: prev.physicalScaling,
    thermalInertia: readPlanetThermalInertiaFromUI(prev, r),
  };
}

function readPlanetThermalInertiaFromUI(prev: PhaseCurveParams, r: UiRefs): ThermalInertiaParams | undefined {
  if (!readCheckbox(r.planetThermalInertiaEnabled)) return undefined;
  return readThermalInertiaFromUI(valueOr(prev.thermalInertia, EMPTY_THERMAL_INERTIA), {
    albedo: r.planetAlbedo,
    emissivity: r.planetEmissivity,
    timescale: r.planetThermalTimescale,
    redistribution: r.planetRedistribution,
  });
}

function readMoonThermalInertiaFromUI(prev: PhaseCurveParams, r: UiRefs): ThermalInertiaParams | undefined {
  if (!readCheckbox(r.moonThermalInertiaEnabled)) return undefined;
  return readThermalInertiaFromUI(valueOr(prev.thermalInertia, EMPTY_THERMAL_INERTIA), {
    albedo: r.moonAlbedo,
    emissivity: r.moonEmissivity,
    timescale: r.moonThermalTimescale,
    redistribution: r.moonRedistribution,
  });
}

function readThermalInertiaFromUI(
  prev: ThermalInertiaParams,
  refs: {
    albedo: HTMLInputElement;
    emissivity: HTMLInputElement;
    timescale: HTMLInputElement;
    redistribution: HTMLInputElement;
  },
): ThermalInertiaParams {
  return {
    enabled: true,
    albedo: clamp(sanitizeFinite(readNumberInput(refs.albedo, valueOr(prev.albedo, 0)), 0), 0, 1),
    emissivity: clamp(sanitizeFinite(readNumberInput(refs.emissivity, valueOr(prev.emissivity, 1)), 1), 0, 1),
    thermalTimescaleSec: sanitizePositive(
      readNumberInput(refs.timescale, valueOr(prev.thermalTimescaleSec, 0)),
      0,
      1e12,
    ),
    redistribution: clamp(
      sanitizeFinite(readNumberInput(refs.redistribution, valueOr(prev.redistribution, 0)), 0),
      0,
      1,
    ),
  };
}

function readForwardScatteringFromUI(ph: PhotometryParams, r: UiRefs): void {
  if (!readCheckbox(r.fsEnabled)) {
    delete ph.forwardScattering;
    return;
  }

  const prev = valueOr(ph.forwardScattering, {});
  ph.forwardScattering = {
    enabled: true,
    amp: sanitizePositive(readNumberInput(r.fsAmp, valueOr(prev.amp, 0)), 0, 10),
    g: clamp(sanitizeFinite(readNumberInput(r.fsG, valueOr(prev.g, 0.8)), 0.8), -0.999, 0.999),
    sigmaPhase: sanitizePositive(readNumberInput(r.fsSigma, valueOr(prev.sigmaPhase, 0.12)), 1e-6, 10),
    phaseOffset: sanitizeFinite(readNumberInput(r.fsOffset, valueOr(prev.phaseOffset, 0)), 0),
    gateWhenBehindStar: readCheckbox(r.fsGateBehind),
    clampNonNegative: true,
  };
}

function readAtmosphereTransmissionFromUI(ph: PhotometryParams, r: UiRefs): void {
  if (!readCheckbox(r.atmEnabled)) {
    delete ph.atmosphereTransmission;
    return;
  }

  const prev = valueOr(ph.atmosphereTransmission, {});
  const { lambdaNm, tauScale } = normalizeAtmosphereSpectralInputs(r);
  ph.atmosphereTransmission = {
    enabled: true,
    target: "planet",
    kind: readSelect(r.atmKind, "hard") as AtmosphereTransmissionParams["kind"],
    r0: sanitizePositive(readNumberInput(r.atmR0, valueOr(prev.r0, 0)), 0, 1e9),
    H: sanitizePositive(readNumberInput(r.atmH, valueOr(prev.H, 0)), 0, 1e9),
    tau0: sanitizePositive(readNumberInput(r.atmTau0, valueOr(prev.tau0, 0)), 0, 1e12),
    lambdaNm,
    tauScale,
  };
}

function readMoonPhaseFromUI(next: BrowserScenarioDraft, ph: PhotometryParams, r: UiRefs): void {
  if (!readCheckbox(r.moonPhaseEnabled) || !next.moon) {
    delete ph.moonPhaseCurve;
    return;
  }

  const prev = valueOr(ph.moonPhaseCurve, EMPTY_PHASE_CURVE);
  ph.moonPhaseCurve = {
    enabled: true,
    reflAmp: sanitizePositive(readNumberInput(r.moonReflAmp, valueOr(prev.reflAmp, 0)), 0, 10),
    thermAmp: sanitizePositive(readNumberInput(r.moonThermAmp, valueOr(prev.thermAmp, 0)), 0, 10),
    reflOffset: valueOr(prev.reflOffset, 0),
    thermOffset: valueOr(prev.thermOffset, 0),
    lambertian: readCheckbox(r.moonLambertian),
    physicalScaling: prev.physicalScaling,
    thermalInertia: readMoonThermalInertiaFromUI(prev, r),
  };
}

function readSmearingFromUI(ph: PhotometryParams, r: UiRefs): void {
  if (!readCheckbox(r.smearEnabled)) {
    ph.cadenceSec = 0;
    ph.nSubsamples = 1;
    return;
  }
  ph.cadenceSec = sanitizePositive(readNumberInput(r.cadenceSec, valueOr(ph.cadenceSec, 60)), 0, 1e9);
  ph.nSubsamples = Math.floor(
    sanitizePositive(readNumberInput(r.nSubsamples, valueOr(ph.nSubsamples, 9)), 1, MAX_SMEARING_SUBSAMPLES),
  );
}

function readStellarVariabilityFromUI(ph: PhotometryParams, r: UiRefs): void {
  if (!readCheckbox(r.varEnabled)) {
    delete ph.stellarVariability;
    return;
  }

  const prev = valueOr(ph.stellarVariability, {});
  ph.stellarVariability = {
    ...prev,
    enabled: true,
    beamingAmp: sanitizeFinite(readNumberInput(r.beamingAmp, valueOr(prev.beamingAmp, 0)), 0),
    ellipsoidalAmp: sanitizeFinite(readNumberInput(r.ellipsoidalAmp, valueOr(prev.ellipsoidalAmp, 0)), 0),
    beamingOffset: sanitizeFinite(readNumberInput(r.beamingOffset, valueOr(prev.beamingOffset, 0)), 0),
    ellipsoidalOffset: sanitizeFinite(
      readNumberInput(r.ellipsoidalOffset, valueOr(prev.ellipsoidalOffset, 0)),
      0,
    ),
    constant: sanitizePositive(readNumberInput(r.varConstant, valueOr(prev.constant, 0)), 0, 10),
  };
}

function readDayNightFromUI(ph: PhotometryParams, r: UiRefs): void {
  if (!readCheckbox(r.dnEnabled)) {
    delete ph.dayNightVisibility;
    return;
  }

  ph.dayNightVisibility = {
    enabled: true,
    clamp: readCheckbox(r.dnClamp),
    reflectedModel: readSelect(r.dnReflectedModel, "lambert") as "lambert" | "cosine",
    thermalModel: readSelect(r.dnThermalModel, "constant") as "constant" | "lambert" | "cosine",
  };
}
