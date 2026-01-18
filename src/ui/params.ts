// src/ui/params.ts
//
// UI <-> SystemParams mapping.

import type { BrightnessPatch, LimbDarkeningModel, PhotometryParams, SystemParams } from "../core/types";
import { DEG2RAD, RAD2DEG, clamp } from "../core/units";
import { vIsFinite, vNormalizeOrZero } from "../physics/vec3";

import type { UiRefs } from "./refs";
import {
  readNumberInput,
  writeNumberInput,
  readCheckbox,
  readSelect,
  sanitizeIncDeg,
  sanitizeEcc,
  sanitizePositive,
  sanitizeFinite,
} from "./inputs";
import { cloneParams } from "../app/scenario";

function getQuadraticLDFromModel(
  model: LimbDarkeningModel | undefined
): { u1: number; u2: number } | undefined {
  const band = (model as any)?.bandpass as string | undefined;
  const bands = ((model as any)?.bands ?? undefined) as Record<string, any> | undefined;
  const law: any = band && bands && bands[band] ? bands[band] : (model as any)?.default;

  if (!law || law.kind !== "quadratic") return undefined;

  const u1 = law.u1;
  const u2 = law.u2;
  if (!Number.isFinite(u1) || !Number.isFinite(u2)) return undefined;

  return { u1, u2 };
}

function ensurePhotometry(p: SystemParams): PhotometryParams {
  p.star.photometry = (p.star.photometry ?? ({} as any)) as any;
  return p.star.photometry as PhotometryParams;
}

export function setObserverDirFromUI(p: SystemParams, r: UiRefs): void {
  const x = sanitizeFinite(readNumberInput(r.observerX, 0), 0);
  const y = sanitizeFinite(readNumberInput(r.observerY, 0), 0);
  const z = sanitizeFinite(readNumberInput(r.observerZ, 1), 1);

  const raw = { x, y, z };
  const dir = vNormalizeOrZero(raw, 1e-15);

  // Fallback: never allow a zero/invalid direction
  const safeDir = vIsFinite(dir) && !(dir.x === 0 && dir.y === 0 && dir.z === 0) ? dir : { x: 0, y: 0, z: 1 };

  p.observer = p.observer ?? ({ dir: safeDir } as any);
  p.observer.dir = safeDir;
}

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

export function loadParamsIntoUI(p: SystemParams, r: UiRefs): void {
  // --- Observer ---
  const od = p.observer?.dir ?? { x: 0, y: 0, z: 1 };
  writeNumberInput(r.observerX, od.x);
  writeNumberInput(r.observerY, od.y);
  writeNumberInput(r.observerZ, od.z);

  // --- Star ---
  writeNumberInput(r.starR, p.star.r);

  const ph = p.star.photometry as any;
  writeNumberInput(r.baselineFlux, ph?.baselineFlux ?? 1.0);
  writeNumberInput(r.gridRes, ph?.gridRes ?? 220);

  const hasLDModel = Boolean(ph?.limbDarkeningModel);
  r.ldEnabled.checked = hasLDModel;

  const qld = getQuadraticLDFromModel(ph?.limbDarkeningModel);
  writeNumberInput(r.ldU1, qld?.u1 ?? 0.35);
  writeNumberInput(r.ldU2, qld?.u2 ?? 0.25);

  const hasPatches = Boolean(ph?.brightnessPatches && ph.brightnessPatches.length > 0);
  r.patchesEnabled.checked = hasPatches;

  const pa1 = ph?.brightnessPatches?.[0] as BrightnessPatch | undefined;
  const pa2 = ph?.brightnessPatches?.[1] as BrightnessPatch | undefined;

  writeNumberInput(r.p1x, (pa1 as any)?.x ?? -10);
  writeNumberInput(r.p1y, (pa1 as any)?.y ?? 8);
  writeNumberInput(r.p1r, (pa1 as any)?.r ?? 7);
  writeNumberInput(r.p1f, (pa1 as any)?.factor ?? 0.75);

  writeNumberInput(r.p2x, (pa2 as any)?.x ?? 12);
  writeNumberInput(r.p2y, (pa2 as any)?.y ?? -6);
  writeNumberInput(r.p2rx, (pa2 as any)?.rx ?? 10);
  writeNumberInput(r.p2ry, (pa2 as any)?.ry ?? 4);
  writeNumberInput(r.p2angle, (pa2 as any)?.angle ?? 0.6);
  writeNumberInput(r.p2f, (pa2 as any)?.factor ?? 1.12);

  // --- Planet ---
  writeNumberInput(r.planetR, p.planet.r);

  if (typeof (p.planet as any).orbit === "function") {
    // UI cannot represent time-dependent providers.
    throw new Error("UI does not support a function-valued planet.orbit (OrbitElementsProvider).");
  }

  writeNumberInput(r.planetA, (p.planet.orbit as any).a);
  writeNumberInput(r.planetE, (p.planet.orbit as any).e);
  writeNumberInput(r.planetInc, (p.planet.orbit as any).inc * RAD2DEG);
  writeNumberInput(r.planetPeriod, (p.planet.orbit as any).period);
  writeNumberInput(r.planetMass, (p.planet.m ?? 0) as number);

  r.planetPhaseEnabled.checked = Boolean(ph?.phaseCurve?.enabled);
  writeNumberInput(r.planetReflAmp, ph?.phaseCurve?.reflAmp ?? 0.001);
  writeNumberInput(r.planetThermAmp, ph?.phaseCurve?.thermAmp ?? 0.0005);
  writeNumberInput(r.planetReflOffset, ph?.phaseCurve?.reflOffset ?? 0);
  writeNumberInput(r.planetThermOffset, ph?.phaseCurve?.thermOffset ?? 0);
  r.planetLambertian.checked = Boolean(ph?.phaseCurve?.lambertian ?? true);
  writeNumberInput(r.planetConstant, ph?.phaseCurve?.constant ?? 0);

  // --- Forward scattering ---
  r.fsEnabled.checked = Boolean(ph?.forwardScattering?.enabled);
  writeNumberInput(r.fsAmp, ph?.forwardScattering?.amp ?? 0);
  writeNumberInput(r.fsG, ph?.forwardScattering?.g ?? 0.8);
  writeNumberInput(r.fsSigma, ph?.forwardScattering?.sigmaPhase ?? 0.12);
  writeNumberInput(r.fsOffset, ph?.forwardScattering?.phaseOffset ?? 0);
  r.fsGateBehind.checked = Boolean(ph?.forwardScattering?.gateWhenBehindStar ?? true);

  // --- Atmosphere transmission ---
  r.atmEnabled.checked = Boolean(ph?.atmosphereTransmission?.enabled);
  r.atmKind.value = String(ph?.atmosphereTransmission?.kind ?? "hard");
  writeNumberInput(r.atmR0, ph?.atmosphereTransmission?.r0 ?? 0);
  writeNumberInput(r.atmH, ph?.atmosphereTransmission?.H ?? 0);
  writeNumberInput(r.atmTau0, ph?.atmosphereTransmission?.tau0 ?? 0);

  // --- Moon ---
  r.moonEnabled.checked = Boolean(p.moon);

  if (p.moon) {
    if (typeof (p.moon as any).orbitAroundPlanet === "function") {
      throw new Error("UI does not support a function-valued moon.orbitAroundPlanet (OrbitElementsProvider).");
    }

    writeNumberInput(r.moonR, p.moon.r);
    writeNumberInput(r.moonA, (p.moon.orbitAroundPlanet as any).a);
    writeNumberInput(r.moonE, (p.moon.orbitAroundPlanet as any).e);
    writeNumberInput(r.moonInc, (p.moon.orbitAroundPlanet as any).inc * RAD2DEG);
    writeNumberInput(r.moonPeriod, (p.moon.orbitAroundPlanet as any).period);
    writeNumberInput(r.moonMass, (p.moon.m ?? 0) as number);
  } else {
    // Provide stable defaults so controls don't show NaN when disabled.
    writeNumberInput(r.moonR, 1);
    writeNumberInput(r.moonA, 10);
    writeNumberInput(r.moonE, 0);
    writeNumberInput(r.moonInc, 0);
    writeNumberInput(r.moonPeriod, 1000);
    writeNumberInput(r.moonMass, 0);
  }

  r.moonPhaseEnabled.checked = Boolean(ph?.moonPhaseCurve?.enabled);
  writeNumberInput(r.moonReflAmp, ph?.moonPhaseCurve?.reflAmp ?? 0);
  writeNumberInput(r.moonThermAmp, ph?.moonPhaseCurve?.thermAmp ?? 0);
  r.moonLambertian.checked = Boolean(ph?.moonPhaseCurve?.lambertian ?? true);

  // --- Smearing ---
  r.smearEnabled.checked = Boolean((ph?.cadenceSec ?? 0) > 0 && (ph?.nSubsamples ?? 1) > 1);
  writeNumberInput(r.cadenceSec, ph?.cadenceSec ?? 60);
  writeNumberInput(r.nSubsamples, ph?.nSubsamples ?? 9);

  // --- Stellar variability ---
  r.varEnabled.checked = Boolean(ph?.stellarVariability?.enabled);
  writeNumberInput(r.beamingAmp, ph?.stellarVariability?.beamingAmp ?? 0);
  writeNumberInput(r.ellipsoidalAmp, ph?.stellarVariability?.ellipsoidalAmp ?? 0);
  writeNumberInput(r.beamingOffset, ph?.stellarVariability?.beamingOffset ?? 0);
  writeNumberInput(r.ellipsoidalOffset, ph?.stellarVariability?.ellipsoidalOffset ?? 0);
  writeNumberInput(r.varConstant, ph?.stellarVariability?.constant ?? 0);

  // --- Day/night visibility ---
  r.dnEnabled.checked = Boolean(ph?.dayNightVisibility?.enabled);
  r.dnClamp.checked = Boolean(ph?.dayNightVisibility?.clamp ?? true);
  r.dnReflectedModel.value = String(ph?.dayNightVisibility?.reflectedModel ?? "lambert");
  r.dnThermalModel.value = String(ph?.dayNightVisibility?.thermalModel ?? "constant");

  // --- Exomoon timing/shape ---
  const exo = (p as any).dynamics?.exomoonTimingShape;
  r.exoEnabled.checked = Boolean(exo?.enabled);

  writeNumberInput(r.exoTRef, exo?.tRef ?? 0);
  writeNumberInput(r.exoVelDt, exo?.velDt ?? 2);

  writeNumberInput(r.exoMoonOmegaDot, exo?.moonOmegaDot ?? 0);
  writeNumberInput(r.exoMoonIncDot, exo?.moonIncDot ?? 0);
  writeNumberInput(r.exoMoonOmegaSmallDot, exo?.moonOmegaSmallDot ?? 0);
  writeNumberInput(r.exoImpactYDot, exo?.moonImpactYDot ?? 0);
}

export function readUIIntoParams(
  current: SystemParams,
  r: UiRefs,
  scenarioDefaults: SystemParams
): SystemParams {
  const next = cloneParams(current);

  setObserverDirFromUI(next, r);

  // STAR
  next.star.r = sanitizePositive(readNumberInput(r.starR, next.star.r), 1e-6, 1e6);

  const ph = ensurePhotometry(next) as any;

  ph.baselineFlux = sanitizePositive(readNumberInput(r.baselineFlux, ph.baselineFlux ?? 1), 0, 1e9);
  ph.gridRes = Math.floor(sanitizePositive(readNumberInput(r.gridRes, ph.gridRes ?? 220), 10, 5000));

  // Limb darkening: quadratic default
  if (readCheckbox(r.ldEnabled)) {
    const prevModel = (ph.limbDarkeningModel ?? {}) as LimbDarkeningModel;
    const prevQ = getQuadraticLDFromModel(prevModel);

    const u1 = sanitizeFinite(readNumberInput(r.ldU1, prevQ?.u1 ?? 0.35), 0.35);
    const u2 = sanitizeFinite(readNumberInput(r.ldU2, prevQ?.u2 ?? 0.25), 0.25);

    ph.limbDarkeningModel = {
      ...(prevModel as any),
      default: { kind: "quadratic", u1, u2 },
    } as any;
  } else {
    delete ph.limbDarkeningModel;
  }

  // Patches
  if (readCheckbox(r.patchesEnabled)) {
    ph.brightnessPatches = buildPatchesFromUI(r);
  } else {
    delete ph.brightnessPatches;
  }

  // PLANET
  next.planet.r = sanitizePositive(readNumberInput(r.planetR, next.planet.r), 0.001, 1e6);

  if (typeof (next.planet as any).orbit === "function") {
    throw new Error("UI does not support a function-valued planet.orbit (OrbitElementsProvider).");
  }

  const pOrbit = next.planet.orbit as any;

  pOrbit.a = sanitizePositive(readNumberInput(r.planetA, pOrbit.a), 0.001, 1e12);
  pOrbit.e = sanitizeEcc(readNumberInput(r.planetE, pOrbit.e));

  const incDeg = sanitizeIncDeg(readNumberInput(r.planetInc, pOrbit.inc * RAD2DEG));
  pOrbit.inc = incDeg * DEG2RAD;

  pOrbit.period = sanitizePositive(readNumberInput(r.planetPeriod, pOrbit.period), 0.001, 1e18);

  // Ensure required angles exist (schema stability)
  pOrbit.Omega = Number.isFinite(pOrbit.Omega) ? pOrbit.Omega : 0;
  pOrbit.omega = Number.isFinite(pOrbit.omega) ? pOrbit.omega : 0;
  pOrbit.t0 = Number.isFinite(pOrbit.t0) ? pOrbit.t0 : 0;

  next.planet.m = sanitizePositive(readNumberInput(r.planetMass, (next.planet.m ?? 0) as number), 0, 1e30);

  // Planet phase curve
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
    } as any;
  } else {
    delete ph.phaseCurve;
  }

  // Forward scattering
  if (readCheckbox(r.fsEnabled)) {
    ph.forwardScattering = {
      enabled: true,
      amp: sanitizePositive(readNumberInput(r.fsAmp, ph.forwardScattering?.amp ?? 0), 0, 10),
      g: clamp(sanitizeFinite(readNumberInput(r.fsG, ph.forwardScattering?.g ?? 0.8), 0.8), -0.999, 0.999),
      sigmaPhase: sanitizePositive(readNumberInput(r.fsSigma, ph.forwardScattering?.sigmaPhase ?? 0.12), 1e-6, 10),
      phaseOffset: sanitizeFinite(readNumberInput(r.fsOffset, ph.forwardScattering?.phaseOffset ?? 0), 0),
      gateWhenBehindStar: readCheckbox(r.fsGateBehind),
      clampNonNegative: true,
    } as any;
  } else {
    delete ph.forwardScattering;
  }

  // Atmosphere transmission
  if (readCheckbox(r.atmEnabled)) {
    ph.atmosphereTransmission = {
      enabled: true,
      target: "planet",
      kind: readSelect(r.atmKind, "hard"),
      r0: sanitizePositive(readNumberInput(r.atmR0, ph.atmosphereTransmission?.r0 ?? 0), 0, 1e9),
      H: sanitizePositive(readNumberInput(r.atmH, ph.atmosphereTransmission?.H ?? 0), 0, 1e9),
      tau0: sanitizePositive(readNumberInput(r.atmTau0, ph.atmosphereTransmission?.tau0 ?? 0), 0, 1e12),
    } as any;
  } else {
    delete ph.atmosphereTransmission;
  }

  // MOON
  if (readCheckbox(r.moonEnabled)) {
    if (!next.moon) {
      // Prefer scenario default moon template (keeps schema/preset consistent).
      const templateMoon = cloneParams(scenarioDefaults).moon;
      if (templateMoon) {
        next.moon = templateMoon as any;
      } else {
        // Hard fallback if scenario has no moon block.
        next.moon = {
          r: 1,
          m: 0,
          orbitAroundPlanet: { a: 10, e: 0, inc: 0, Omega: 0, omega: 0, period: 1000, t0: 0 },
        } as any;
      }
    }

    if (typeof (next.moon as any).orbitAroundPlanet === "function") {
      throw new Error("UI does not support a function-valued moon.orbitAroundPlanet (OrbitElementsProvider).");
    }

    next.moon!.r = sanitizePositive(readNumberInput(r.moonR, next.moon!.r), 0.001, 1e6);

    const mOrbit = next.moon!.orbitAroundPlanet as any;

    mOrbit.a = sanitizePositive(readNumberInput(r.moonA, mOrbit.a), 0.001, 1e12);
    mOrbit.e = sanitizeEcc(readNumberInput(r.moonE, mOrbit.e));

    const mIncDeg = sanitizeIncDeg(readNumberInput(r.moonInc, mOrbit.inc * RAD2DEG));
    mOrbit.inc = mIncDeg * DEG2RAD;

    mOrbit.period = sanitizePositive(readNumberInput(r.moonPeriod, mOrbit.period), 0.001, 1e18);

    mOrbit.Omega = Number.isFinite(mOrbit.Omega) ? mOrbit.Omega : 0;
    mOrbit.omega = Number.isFinite(mOrbit.omega) ? mOrbit.omega : 0;
    mOrbit.t0 = Number.isFinite(mOrbit.t0) ? mOrbit.t0 : 0;

    next.moon!.m = sanitizePositive(readNumberInput(r.moonMass, (next.moon!.m ?? 0) as number), 0, 1e30);
  } else {
    delete next.moon;
  }

  // Moon phase curve
  if (readCheckbox(r.moonPhaseEnabled) && next.moon) {
    ph.moonPhaseCurve = {
      enabled: true,
      reflAmp: sanitizePositive(readNumberInput(r.moonReflAmp, ph.moonPhaseCurve?.reflAmp ?? 0), 0, 10),
      thermAmp: sanitizePositive(readNumberInput(r.moonThermAmp, ph.moonPhaseCurve?.thermAmp ?? 0), 0, 10),
      lambertian: readCheckbox(r.moonLambertian),
      physicalScaling: ph.moonPhaseCurve?.physicalScaling,
    } as any;
  } else {
    delete ph.moonPhaseCurve;
  }

  // Smearing params (measurement layer)
  if (readCheckbox(r.smearEnabled)) {
    ph.cadenceSec = sanitizePositive(readNumberInput(r.cadenceSec, ph.cadenceSec ?? 60), 0, 1e9);
    ph.nSubsamples = Math.floor(sanitizePositive(readNumberInput(r.nSubsamples, ph.nSubsamples ?? 9), 1, 4096));
  } else {
    ph.cadenceSec = 0;
    ph.nSubsamples = 1;
  }

  // Stellar variability
  if (readCheckbox(r.varEnabled)) {
    ph.stellarVariability = {
      enabled: true,
      beamingAmp: sanitizeFinite(readNumberInput(r.beamingAmp, ph.stellarVariability?.beamingAmp ?? 0), 0),
      ellipsoidalAmp: sanitizeFinite(readNumberInput(r.ellipsoidalAmp, ph.stellarVariability?.ellipsoidalAmp ?? 0), 0),
      beamingOffset: sanitizeFinite(readNumberInput(r.beamingOffset, ph.stellarVariability?.beamingOffset ?? 0), 0),
      ellipsoidalOffset: sanitizeFinite(readNumberInput(r.ellipsoidalOffset, ph.stellarVariability?.ellipsoidalOffset ?? 0), 0),
      constant: sanitizePositive(readNumberInput(r.varConstant, ph.stellarVariability?.constant ?? 0), 0, 10),
    } as any;
  } else {
    delete ph.stellarVariability;
  }

  // Day/night visibility
  if (readCheckbox(r.dnEnabled)) {
    ph.dayNightVisibility = {
      enabled: true,
      clamp: readCheckbox(r.dnClamp),
      reflectedModel: readSelect(r.dnReflectedModel, "lambert"),
      thermalModel: readSelect(r.dnThermalModel, "constant"),
    } as any;
  } else {
    delete ph.dayNightVisibility;
  }

  // Exomoon timing/shape (dynamics hook)
  if (readCheckbox(r.exoEnabled)) {
    next.dynamics = next.dynamics ?? ({} as any);

    (next.dynamics as any).exomoonTimingShape = {
      enabled: true,
      tRef: sanitizeFinite(readNumberInput(r.exoTRef, (next.dynamics as any).exomoonTimingShape?.tRef ?? 0), 0),
      velDt: sanitizePositive(readNumberInput(r.exoVelDt, (next.dynamics as any).exomoonTimingShape?.velDt ?? 2), 1e-6, 1e9),
      moonOmegaDot: sanitizeFinite(readNumberInput(r.exoMoonOmegaDot, (next.dynamics as any).exomoonTimingShape?.moonOmegaDot ?? 0), 0),
      moonIncDot: sanitizeFinite(readNumberInput(r.exoMoonIncDot, (next.dynamics as any).exomoonTimingShape?.moonIncDot ?? 0), 0),
      moonOmegaSmallDot: sanitizeFinite(
        readNumberInput(r.exoMoonOmegaSmallDot, (next.dynamics as any).exomoonTimingShape?.moonOmegaSmallDot ?? 0),
        0
      ),
      moonImpactYDot: sanitizeFinite(readNumberInput(r.exoImpactYDot, (next.dynamics as any).exomoonTimingShape?.moonImpactYDot ?? 0), 0),
    } as any;
  } else if (next.dynamics && (next.dynamics as any).exomoonTimingShape) {
    (next.dynamics as any).exomoonTimingShape.enabled = false;
  }

  return next;
}
