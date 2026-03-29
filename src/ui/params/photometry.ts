import type { BrightnessPatch, LimbDarkeningModel, SystemParams } from "../../core/types";
import { clamp } from "../../core/units";
import {
  readCheckbox,
  readNumberInput,
  readSelect,
  sanitizeFinite,
  sanitizePositive,
  writeNumberInput,
} from "../inputs";
import type { UiRefs } from "../refs";
import {
  ensurePhotometry,
  formatNumberList,
  formatQuadraticBands,
  getQuadraticLDFromModel,
  parseNumberList,
  parseQuadraticBands,
} from "./common";

function buildPatchesFromUI(r: UiRefs): BrightnessPatch[] {
  const patches: BrightnessPatch[] = [];

  patches.push({
    shape: "circle",
    x: sanitizeFinite(readNumberInput(r.p1x, -10), -10),
    y: sanitizeFinite(readNumberInput(r.p1y, 8), 8),
    r: sanitizePositive(readNumberInput(r.p1r, 7), 0, 1e6),
    factor: sanitizePositive(readNumberInput(r.p1f, 1), 0, 1e6),
  });

  patches.push({
    shape: "ellipse",
    x: sanitizeFinite(readNumberInput(r.p2x, 12), 12),
    y: sanitizeFinite(readNumberInput(r.p2y, -6), -6),
    rx: sanitizePositive(readNumberInput(r.p2rx, 10), 0, 1e6),
    ry: sanitizePositive(readNumberInput(r.p2ry, 4), 0, 1e6),
    angle: sanitizeFinite(readNumberInput(r.p2angle, 0.6), 0.6),
    factor: sanitizePositive(readNumberInput(r.p2f, 1), 0, 1e6),
  });

  return patches;
}

export function loadPhotometryIntoUI(p: SystemParams, r: UiRefs): void {
  const ph = p.star.photometry;

  writeNumberInput(r.baselineFlux, ph?.baselineFlux ?? 1.0);
  writeNumberInput(r.gridRes, ph?.gridRes ?? 220);

  const hasLDModel = Boolean(ph?.limbDarkeningModel);
  r.ldEnabled.checked = hasLDModel;

  const qld = getQuadraticLDFromModel(ph?.limbDarkeningModel);
  writeNumberInput(r.ldU1, qld?.u1 ?? 0.35);
  writeNumberInput(r.ldU2, qld?.u2 ?? 0.25);
  r.ldBandpass.value = String(ph?.limbDarkeningModel?.bandpass ?? "");
  r.ldBands.value = formatQuadraticBands(ph?.limbDarkeningModel?.bands);

  const hasPatches = Boolean(ph?.brightnessPatches && ph.brightnessPatches.length > 0);
  r.patchesEnabled.checked = hasPatches;

  const pa1 = ph?.brightnessPatches?.[0] as BrightnessPatch | undefined;
  const pa2 = ph?.brightnessPatches?.[1] as BrightnessPatch | undefined;

  writeNumberInput(r.p1x, pa1?.x ?? -10);
  writeNumberInput(r.p1y, pa1?.y ?? 8);
  writeNumberInput(r.p1r, pa1?.r ?? 7);
  writeNumberInput(r.p1f, pa1?.factor ?? 0.75);

  writeNumberInput(r.p2x, pa2?.x ?? 12);
  writeNumberInput(r.p2y, pa2?.y ?? -6);
  writeNumberInput(r.p2rx, pa2?.rx ?? 10);
  writeNumberInput(r.p2ry, pa2?.ry ?? 4);
  writeNumberInput(r.p2angle, pa2?.angle ?? 0.6);
  writeNumberInput(r.p2f, pa2?.factor ?? 1.12);

  const spot = ph?.spotEvolution;
  r.spotEvolutionEnabled.checked = Boolean(spot?.enabled);
  writeNumberInput(r.spotRotationPeriod, spot?.rotationPeriodSec ?? 20000);
  writeNumberInput(r.spotCoverage, spot?.coverage ?? 1);
  writeNumberInput(r.spotLifetime, spot?.lifetimeSec ?? 0);
  writeNumberInput(r.spotDriftRate, spot?.driftRateRadPerSec ?? 0);

  r.planetPhaseEnabled.checked = Boolean(ph?.phaseCurve?.enabled);
  writeNumberInput(r.planetReflAmp, ph?.phaseCurve?.reflAmp ?? 0.001);
  writeNumberInput(r.planetThermAmp, ph?.phaseCurve?.thermAmp ?? 0.0005);
  writeNumberInput(r.planetReflOffset, ph?.phaseCurve?.reflOffset ?? 0);
  writeNumberInput(r.planetThermOffset, ph?.phaseCurve?.thermOffset ?? 0);
  r.planetLambertian.checked = Boolean(ph?.phaseCurve?.lambertian ?? true);
  writeNumberInput(r.planetConstant, ph?.phaseCurve?.constant ?? 0);

  const pThermal = ph?.phaseCurve?.thermalInertia;
  r.planetThermalInertiaEnabled.checked = Boolean(pThermal?.enabled);
  writeNumberInput(r.planetAlbedo, pThermal?.albedo ?? 0);
  writeNumberInput(r.planetEmissivity, pThermal?.emissivity ?? 1);
  writeNumberInput(r.planetThermalTimescale, pThermal?.thermalTimescaleSec ?? 0);
  writeNumberInput(r.planetRedistribution, pThermal?.redistribution ?? 0);

  r.fsEnabled.checked = Boolean(ph?.forwardScattering?.enabled);
  writeNumberInput(r.fsAmp, ph?.forwardScattering?.amp ?? 0);
  writeNumberInput(r.fsG, ph?.forwardScattering?.g ?? 0.8);
  writeNumberInput(r.fsSigma, ph?.forwardScattering?.sigmaPhase ?? 0.12);
  writeNumberInput(r.fsOffset, ph?.forwardScattering?.phaseOffset ?? 0);
  r.fsGateBehind.checked = Boolean(ph?.forwardScattering?.gateWhenBehindStar ?? true);

  r.atmEnabled.checked = Boolean(ph?.atmosphereTransmission?.enabled);
  r.atmKind.value = String(ph?.atmosphereTransmission?.kind ?? "hard");
  writeNumberInput(r.atmR0, ph?.atmosphereTransmission?.r0 ?? 0);
  writeNumberInput(r.atmH, ph?.atmosphereTransmission?.H ?? 0);
  writeNumberInput(r.atmTau0, ph?.atmosphereTransmission?.tau0 ?? 0);
  r.atmLambdaNm.value = formatNumberList(ph?.atmosphereTransmission?.lambdaNm);
  r.atmTauScale.value = formatNumberList(ph?.atmosphereTransmission?.tauScale);

  r.moonPhaseEnabled.checked = Boolean(ph?.moonPhaseCurve?.enabled);
  writeNumberInput(r.moonReflAmp, ph?.moonPhaseCurve?.reflAmp ?? 0);
  writeNumberInput(r.moonThermAmp, ph?.moonPhaseCurve?.thermAmp ?? 0);
  r.moonLambertian.checked = Boolean(ph?.moonPhaseCurve?.lambertian ?? true);
  // Note: moonPhaseCurve.reflOffset / thermOffset have no dedicated HTML inputs;
  // values are preserved in readPhotometryFromUI via the existing params object.

  const mThermal = ph?.moonPhaseCurve?.thermalInertia;
  r.moonThermalInertiaEnabled.checked = Boolean(mThermal?.enabled);
  writeNumberInput(r.moonAlbedo, mThermal?.albedo ?? 0);
  writeNumberInput(r.moonEmissivity, mThermal?.emissivity ?? 1);
  writeNumberInput(r.moonThermalTimescale, mThermal?.thermalTimescaleSec ?? 0);
  writeNumberInput(r.moonRedistribution, mThermal?.redistribution ?? 0);

  r.smearEnabled.checked = Boolean((ph?.cadenceSec ?? 0) > 0);
  writeNumberInput(r.cadenceSec, ph?.cadenceSec ?? 60);
  writeNumberInput(r.nSubsamples, ph?.nSubsamples ?? 9);

  r.varEnabled.checked = Boolean(ph?.stellarVariability?.enabled);
  writeNumberInput(r.beamingAmp, ph?.stellarVariability?.beamingAmp ?? 0);
  writeNumberInput(r.ellipsoidalAmp, ph?.stellarVariability?.ellipsoidalAmp ?? 0);
  writeNumberInput(r.beamingOffset, ph?.stellarVariability?.beamingOffset ?? 0);
  writeNumberInput(r.ellipsoidalOffset, ph?.stellarVariability?.ellipsoidalOffset ?? 0);
  writeNumberInput(r.varConstant, ph?.stellarVariability?.constant ?? 0);

  r.dnEnabled.checked = Boolean(ph?.dayNightVisibility?.enabled);
  r.dnClamp.checked = Boolean(ph?.dayNightVisibility?.clamp ?? true);
  r.dnReflectedModel.value = String(ph?.dayNightVisibility?.reflectedModel ?? "lambert");
  r.dnThermalModel.value = String(ph?.dayNightVisibility?.thermalModel ?? "constant");
}

export function readPhotometryFromUI(next: SystemParams, r: UiRefs): void {
  const ph = ensurePhotometry(next);

  ph.baselineFlux = sanitizePositive(readNumberInput(r.baselineFlux, ph.baselineFlux ?? 1), 0, 1e9);
  ph.gridRes = Math.floor(sanitizePositive(readNumberInput(r.gridRes, ph.gridRes ?? 220), 10, 5000));

  if (readCheckbox(r.ldEnabled)) {
    const prevModel = (ph.limbDarkeningModel ?? {}) as LimbDarkeningModel;
    const prevQ = getQuadraticLDFromModel(prevModel);

    const u1 = sanitizeFinite(readNumberInput(r.ldU1, prevQ?.u1 ?? 0.35), 0.35);
    const u2 = sanitizeFinite(readNumberInput(r.ldU2, prevQ?.u2 ?? 0.25), 0.25);
    const bandpassRaw = r.ldBandpass.value.trim();
    const bandsText = r.ldBands.value ?? "";
    const bands = bandsText.trim().length > 0 ? parseQuadraticBands(bandsText) : undefined;

    ph.limbDarkeningModel = {
      ...prevModel,
      bandpass: bandpassRaw.length > 0 ? bandpassRaw : undefined,
      default: { kind: "quadratic", u1, u2 },
      bands,
    };
  } else {
    delete ph.limbDarkeningModel;
  }

  if (readCheckbox(r.patchesEnabled)) {
    ph.brightnessPatches = buildPatchesFromUI(r);
  } else {
    delete ph.brightnessPatches;
  }

  if (readCheckbox(r.spotEvolutionEnabled)) {
    ph.spotEvolution = {
      enabled: true,
      rotationPeriodSec: sanitizePositive(
        readNumberInput(r.spotRotationPeriod, ph.spotEvolution?.rotationPeriodSec ?? 20000),
        1,
        1e12,
      ),
      coverage: clamp(
        sanitizeFinite(readNumberInput(r.spotCoverage, ph.spotEvolution?.coverage ?? 1), 1),
        0,
        1,
      ),
      lifetimeSec: sanitizePositive(
        readNumberInput(r.spotLifetime, ph.spotEvolution?.lifetimeSec ?? 0),
        0,
        1e12,
      ),
      driftRateRadPerSec: sanitizeFinite(
        readNumberInput(r.spotDriftRate, ph.spotEvolution?.driftRateRadPerSec ?? 0),
        0,
      ),
      tRef: ph.spotEvolution?.tRef ?? 0,
      rotationPhase0: ph.spotEvolution?.rotationPhase0 ?? 0,
    };
  } else {
    delete ph.spotEvolution;
  }

  if (readCheckbox(r.planetPhaseEnabled)) {
    ph.phaseCurve = {
      enabled: true,
      reflAmp: sanitizePositive(readNumberInput(r.planetReflAmp, ph.phaseCurve?.reflAmp ?? 0), 0, 10),
      thermAmp: sanitizePositive(readNumberInput(r.planetThermAmp, ph.phaseCurve?.thermAmp ?? 0), 0, 10),
      reflOffset: sanitizeFinite(readNumberInput(r.planetReflOffset, ph.phaseCurve?.reflOffset ?? 0), 0),
      thermOffset: sanitizeFinite(readNumberInput(r.planetThermOffset, ph.phaseCurve?.thermOffset ?? 0), 0),
      lambertian: readCheckbox(r.planetLambertian),
      constant: sanitizePositive(readNumberInput(r.planetConstant, ph.phaseCurve?.constant ?? 0), 0, 10),
      physicalScaling: ph.phaseCurve?.physicalScaling,
      thermalInertia: readCheckbox(r.planetThermalInertiaEnabled)
        ? {
            enabled: true,
            albedo: clamp(
              sanitizeFinite(readNumberInput(r.planetAlbedo, ph.phaseCurve?.thermalInertia?.albedo ?? 0), 0),
              0,
              1,
            ),
            emissivity: clamp(
              sanitizeFinite(
                readNumberInput(r.planetEmissivity, ph.phaseCurve?.thermalInertia?.emissivity ?? 1),
                1,
              ),
              0,
              1,
            ),
            thermalTimescaleSec: sanitizePositive(
              readNumberInput(
                r.planetThermalTimescale,
                ph.phaseCurve?.thermalInertia?.thermalTimescaleSec ?? 0,
              ),
              0,
              1e12,
            ),
            redistribution: clamp(
              sanitizeFinite(
                readNumberInput(r.planetRedistribution, ph.phaseCurve?.thermalInertia?.redistribution ?? 0),
                0,
              ),
              0,
              1,
            ),
          }
        : undefined,
    };
  } else {
    delete ph.phaseCurve;
  }

  if (readCheckbox(r.fsEnabled)) {
    ph.forwardScattering = {
      enabled: true,
      amp: sanitizePositive(readNumberInput(r.fsAmp, ph.forwardScattering?.amp ?? 0), 0, 10),
      g: clamp(sanitizeFinite(readNumberInput(r.fsG, ph.forwardScattering?.g ?? 0.8), 0.8), -0.999, 0.999),
      sigmaPhase: sanitizePositive(
        readNumberInput(r.fsSigma, ph.forwardScattering?.sigmaPhase ?? 0.12),
        1e-6,
        10,
      ),
      phaseOffset: sanitizeFinite(readNumberInput(r.fsOffset, ph.forwardScattering?.phaseOffset ?? 0), 0),
      gateWhenBehindStar: readCheckbox(r.fsGateBehind),
      clampNonNegative: true,
    };
  } else {
    delete ph.forwardScattering;
  }

  if (readCheckbox(r.atmEnabled)) {
    const lambdaNm = parseNumberList(r.atmLambdaNm.value).filter((v) => v > 0);
    const tauScale = parseNumberList(r.atmTauScale.value).map((v) => Math.max(0, v));
    ph.atmosphereTransmission = {
      enabled: true,
      target: "planet",
      kind: readSelect(r.atmKind, "hard") as "hard" | "exponential-halo" | "custom",
      r0: sanitizePositive(readNumberInput(r.atmR0, ph.atmosphereTransmission?.r0 ?? 0), 0, 1e9),
      H: sanitizePositive(readNumberInput(r.atmH, ph.atmosphereTransmission?.H ?? 0), 0, 1e9),
      tau0: sanitizePositive(readNumberInput(r.atmTau0, ph.atmosphereTransmission?.tau0 ?? 0), 0, 1e12),
      lambdaNm: lambdaNm.length > 0 ? lambdaNm : undefined,
      tauScale: tauScale.length > 0 ? tauScale : undefined,
    };
  } else {
    delete ph.atmosphereTransmission;
  }

  if (readCheckbox(r.moonPhaseEnabled) && next.moon) {
    ph.moonPhaseCurve = {
      enabled: true,
      reflAmp: sanitizePositive(readNumberInput(r.moonReflAmp, ph.moonPhaseCurve?.reflAmp ?? 0), 0, 10),
      thermAmp: sanitizePositive(readNumberInput(r.moonThermAmp, ph.moonPhaseCurve?.thermAmp ?? 0), 0, 10),
      reflOffset: ph.moonPhaseCurve?.reflOffset ?? 0,
      thermOffset: ph.moonPhaseCurve?.thermOffset ?? 0,
      lambertian: readCheckbox(r.moonLambertian),
      physicalScaling: ph.moonPhaseCurve?.physicalScaling,
      thermalInertia: readCheckbox(r.moonThermalInertiaEnabled)
        ? {
            enabled: true,
            albedo: clamp(
              sanitizeFinite(
                readNumberInput(r.moonAlbedo, ph.moonPhaseCurve?.thermalInertia?.albedo ?? 0),
                0,
              ),
              0,
              1,
            ),
            emissivity: clamp(
              sanitizeFinite(
                readNumberInput(r.moonEmissivity, ph.moonPhaseCurve?.thermalInertia?.emissivity ?? 1),
                1,
              ),
              0,
              1,
            ),
            thermalTimescaleSec: sanitizePositive(
              readNumberInput(
                r.moonThermalTimescale,
                ph.moonPhaseCurve?.thermalInertia?.thermalTimescaleSec ?? 0,
              ),
              0,
              1e12,
            ),
            redistribution: clamp(
              sanitizeFinite(
                readNumberInput(r.moonRedistribution, ph.moonPhaseCurve?.thermalInertia?.redistribution ?? 0),
                0,
              ),
              0,
              1,
            ),
          }
        : undefined,
    };
  } else {
    delete ph.moonPhaseCurve;
  }

  if (readCheckbox(r.smearEnabled)) {
    ph.cadenceSec = sanitizePositive(readNumberInput(r.cadenceSec, ph.cadenceSec ?? 60), 0, 1e9);
    ph.nSubsamples = Math.floor(
      sanitizePositive(readNumberInput(r.nSubsamples, ph.nSubsamples ?? 9), 1, 4096),
    );
  } else {
    ph.cadenceSec = 0;
    ph.nSubsamples = 1;
  }

  if (readCheckbox(r.varEnabled)) {
    ph.stellarVariability = {
      enabled: true,
      beamingAmp: sanitizeFinite(readNumberInput(r.beamingAmp, ph.stellarVariability?.beamingAmp ?? 0), 0),
      ellipsoidalAmp: sanitizeFinite(
        readNumberInput(r.ellipsoidalAmp, ph.stellarVariability?.ellipsoidalAmp ?? 0),
        0,
      ),
      beamingOffset: sanitizeFinite(
        readNumberInput(r.beamingOffset, ph.stellarVariability?.beamingOffset ?? 0),
        0,
      ),
      ellipsoidalOffset: sanitizeFinite(
        readNumberInput(r.ellipsoidalOffset, ph.stellarVariability?.ellipsoidalOffset ?? 0),
        0,
      ),
      constant: sanitizePositive(readNumberInput(r.varConstant, ph.stellarVariability?.constant ?? 0), 0, 10),
    };
  } else {
    delete ph.stellarVariability;
  }

  if (readCheckbox(r.dnEnabled)) {
    ph.dayNightVisibility = {
      enabled: true,
      clamp: readCheckbox(r.dnClamp),
      reflectedModel: readSelect(r.dnReflectedModel, "lambert") as "lambert" | "cosine",
      thermalModel: readSelect(r.dnThermalModel, "constant") as "constant" | "lambert" | "cosine",
    };
  } else {
    delete ph.dayNightVisibility;
  }
}
