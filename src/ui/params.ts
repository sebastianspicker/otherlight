// src/ui/params.ts
//
// UI <-> SystemParams mapping.

import type {
  BrightnessPatch,
  LimbDarkeningLawQuadratic,
  LimbDarkeningModel,
  PhotometryParams,
  SystemParams,
} from "../core/types";
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
  model: LimbDarkeningModel | undefined,
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

function parseNumberList(text: string): number[] {
  if (typeof text !== "string" || text.trim().length === 0) return [];
  return text
    .split(/[,;\s]+/)
    .map((v) => Number(v))
    .filter((v) => Number.isFinite(v));
}

function formatNumberList(values: number[] | undefined): string {
  if (!Array.isArray(values) || values.length === 0) return "";
  return values
    .map((v) => (Number.isFinite(v) ? String(v) : ""))
    .filter(Boolean)
    .join(", ");
}

function parseQuadraticBands(text: string): Record<string, LimbDarkeningLawQuadratic> | undefined {
  const entries = typeof text === "string" ? text.split(/[;\n]+/) : [];
  const bands: Record<string, LimbDarkeningLawQuadratic> = {};

  for (const entry of entries) {
    const trimmed = entry.trim();
    if (!trimmed) continue;

    const parts = trimmed.split(/[:=]/);
    if (parts.length < 2) continue;

    const band = parts[0].trim();
    if (!band) continue;

    const coeffs = parts[1]
      .trim()
      .split(/[,\\s]+/)
      .map((v) => Number(v))
      .filter((v) => Number.isFinite(v));

    if (coeffs.length < 2) continue;

    bands[band] = { kind: "quadratic", u1: coeffs[0], u2: coeffs[1] };
  }

  return Object.keys(bands).length > 0 ? bands : undefined;
}

function formatQuadraticBands(bands: Record<string, any> | undefined): string {
  if (!bands) return "";
  const parts: string[] = [];

  for (const [band, law] of Object.entries(bands)) {
    if (!law || law.kind !== "quadratic") continue;
    const u1 = (law as any).u1;
    const u2 = (law as any).u2;
    if (!Number.isFinite(u1) || !Number.isFinite(u2)) continue;
    parts.push(`${band}:${u1},${u2}`);
  }

  return parts.join("; ");
}

type OrbitInputRefs = {
  a: HTMLInputElement;
  e: HTMLInputElement;
  inc: HTMLInputElement;
  period: HTMLInputElement;
};

const ORBIT_A_MIN = 0.001;
const ORBIT_A_MAX = 1e12;
const ORBIT_PERIOD_MIN = 0.001;
const ORBIT_PERIOD_MAX = 1e18;
const OBLA_MAX = 0.95;
const RING_INC_MAX_DEG = 90;

function writeOrbitInputs(
  r: OrbitInputRefs,
  orbit: { a: number; e: number; inc: number; period: number },
): void {
  writeNumberInput(r.a, orbit.a);
  writeNumberInput(r.e, orbit.e);
  writeNumberInput(r.inc, orbit.inc * RAD2DEG);
  writeNumberInput(r.period, orbit.period);
}

function readOrbitInputs(r: OrbitInputRefs, orbit: any): void {
  const aFallback = Number.isFinite(orbit.a) ? orbit.a : ORBIT_A_MIN;
  const eFallback = Number.isFinite(orbit.e) ? orbit.e : 0;
  const incFallbackDeg = Number.isFinite(orbit.inc) ? orbit.inc * RAD2DEG : 0;
  const periodFallback = Number.isFinite(orbit.period) ? orbit.period : ORBIT_PERIOD_MIN;

  orbit.a = sanitizePositive(readNumberInput(r.a, aFallback), ORBIT_A_MIN, ORBIT_A_MAX);
  orbit.e = sanitizeEcc(readNumberInput(r.e, eFallback));

  const incDeg = sanitizeIncDeg(readNumberInput(r.inc, incFallbackDeg));
  orbit.inc = incDeg * DEG2RAD;

  orbit.period = sanitizePositive(
    readNumberInput(r.period, periodFallback),
    ORBIT_PERIOD_MIN,
    ORBIT_PERIOD_MAX,
  );

  // Ensure required angles exist (schema stability)
  orbit.Omega = Number.isFinite(orbit.Omega) ? orbit.Omega : 0;
  orbit.omega = Number.isFinite(orbit.omega) ? orbit.omega : 0;
  orbit.t0 = Number.isFinite(orbit.t0) ? orbit.t0 : 0;
}

type OblateInputRefs = {
  enabled: HTMLInputElement;
  oblateness: HTMLInputElement;
};

type RingInputRefs = {
  enabled: HTMLInputElement;
  inner: HTMLInputElement;
  outer: HTMLInputElement;
  incDeg: HTMLInputElement;
  angleDeg: HTMLInputElement;
};

function readOblatenessInput(refs: OblateInputRefs, fallback = 0): number | undefined {
  if (!readCheckbox(refs.enabled)) return undefined;
  const raw = sanitizeFinite(readNumberInput(refs.oblateness, fallback), fallback);
  const f = clamp(raw, 0, OBLA_MAX);
  return Number.isFinite(f) ? f : fallback;
}

function readRingInputs(
  refs: RingInputRefs,
  defaults: { inner: number; outer: number; incDeg?: number; angleDeg?: number },
):
  | {
      innerRadius: number;
      outerRadius: number;
      inclination: number;
      positionAngle: number;
    }
  | undefined {
  if (!readCheckbox(refs.enabled)) return undefined;

  const inner = sanitizePositive(readNumberInput(refs.inner, defaults.inner), 0, 1e12);
  const outerRaw = sanitizePositive(readNumberInput(refs.outer, defaults.outer), 0, 1e12);
  const outer = Math.max(inner + 1e-6, outerRaw);

  const incDeg = clamp(
    sanitizeFinite(readNumberInput(refs.incDeg, defaults.incDeg ?? 0), defaults.incDeg ?? 0),
    0,
    RING_INC_MAX_DEG,
  );
  const angleDeg = sanitizeFinite(
    readNumberInput(refs.angleDeg, defaults.angleDeg ?? 0),
    defaults.angleDeg ?? 0,
  );

  return {
    innerRadius: inner,
    outerRadius: outer,
    inclination: incDeg * DEG2RAD,
    positionAngle: angleDeg * DEG2RAD,
  };
}

type PerturberInputRefs = {
  enabled: HTMLInputElement;
  mu: HTMLInputElement;
  a: HTMLInputElement;
  e: HTMLInputElement;
  incDeg: HTMLInputElement;
  period: HTMLInputElement;
};

function estimateMuFromOrbit(orbit: { a: number; period: number } | undefined): number | undefined {
  if (!orbit) return undefined;
  const a = orbit.a;
  const p = orbit.period;
  if (!(Number.isFinite(a) && a > 0 && Number.isFinite(p) && p > 0)) return undefined;
  const n = (2 * Math.PI) / p;
  const mu = n * n * a * a * a;
  return Number.isFinite(mu) ? mu : undefined;
}

function writePerturberInputs(
  refs: PerturberInputRefs,
  p: any,
  defaults: {
    mu: number;
    a: number;
    e: number;
    incDeg: number;
    period: number;
  },
): void {
  refs.enabled.checked = Boolean(p && p.enabled !== false);
  writeNumberInput(refs.mu, p?.mu ?? defaults.mu);
  writeNumberInput(refs.a, p?.orbit?.a ?? defaults.a);
  writeNumberInput(refs.e, p?.orbit?.e ?? defaults.e);
  writeNumberInput(
    refs.incDeg,
    Number.isFinite(p?.orbit?.inc) ? (p.orbit.inc as number) * RAD2DEG : defaults.incDeg,
  );
  writeNumberInput(refs.period, p?.orbit?.period ?? defaults.period);
}

function readPerturberInputs(
  refs: PerturberInputRefs,
  defaults: {
    mu: number;
    a: number;
    e: number;
    incDeg: number;
    period: number;
  },
):
  | {
      enabled: true;
      mu: number;
      orbit: { a: number; e: number; inc: number; Omega: number; omega: number; period: number; t0: number };
    }
  | undefined {
  if (!readCheckbox(refs.enabled)) return undefined;

  const mu = sanitizePositive(readNumberInput(refs.mu, defaults.mu), 0, 1e30);
  const a = sanitizePositive(readNumberInput(refs.a, defaults.a), ORBIT_A_MIN, ORBIT_A_MAX);
  const e = sanitizeEcc(readNumberInput(refs.e, defaults.e));
  const incDeg = sanitizeIncDeg(readNumberInput(refs.incDeg, defaults.incDeg));
  const period = sanitizePositive(
    readNumberInput(refs.period, defaults.period),
    ORBIT_PERIOD_MIN,
    ORBIT_PERIOD_MAX,
  );

  return {
    enabled: true,
    mu,
    orbit: {
      a,
      e,
      inc: incDeg * DEG2RAD,
      Omega: 0,
      omega: 0,
      period,
      t0: 0,
    },
  };
}

export function setObserverDirFromUI(p: SystemParams, r: UiRefs): void {
  const x = sanitizeFinite(readNumberInput(r.observerX, 0), 0);
  const y = sanitizeFinite(readNumberInput(r.observerY, 0), 0);
  const z = sanitizeFinite(readNumberInput(r.observerZ, 1), 1);

  const raw = { x, y, z };
  const dir = vNormalizeOrZero(raw, 1e-15);

  // Fallback: never allow a zero/invalid direction
  const safeDir = vIsFinite(dir) && !(dir.x === 0 && dir.y === 0 && dir.z === 0) ? dir : { x: 0, y: 0, z: 1 };

  const obs = p.observer ?? ({ dir: safeDir } as any);
  p.observer = obs;
  obs.dir = safeDir;
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
  r.ldBandpass.value = String((ph?.limbDarkeningModel as any)?.bandpass ?? "");
  r.ldBands.value = formatQuadraticBands((ph?.limbDarkeningModel as any)?.bands);

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

  // Spot evolution (rotation/lifecycle)
  const spot = ph?.spotEvolution;
  r.spotEvolutionEnabled.checked = Boolean(spot?.enabled);
  writeNumberInput(r.spotRotationPeriod, spot?.rotationPeriodSec ?? 20000);
  writeNumberInput(r.spotCoverage, spot?.coverage ?? 1);
  writeNumberInput(r.spotLifetime, spot?.lifetimeSec ?? 0);
  writeNumberInput(r.spotDriftRate, spot?.driftRateRadPerSec ?? 0);

  // --- Planet ---
  writeNumberInput(r.planetR, p.planet.r);

  if (typeof (p.planet as any).orbit === "function") {
    // UI cannot represent time-dependent providers.
    throw new Error("UI does not support a function-valued planet.orbit (OrbitElementsProvider).");
  }

  writeOrbitInputs(
    { a: r.planetA, e: r.planetE, inc: r.planetInc, period: r.planetPeriod },
    p.planet.orbit as any,
  );
  writeNumberInput(r.planetMass, (p.planet.m ?? 0) as number);

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

  // Planet shape / rings
  const pShape = p.planet.shape;
  r.planetOblateEnabled.checked = Boolean(
    pShape && Number.isFinite(pShape.oblateness ?? Number.NaN) && (pShape.oblateness as number) > 0,
  );
  writeNumberInput(r.planetOblateness, pShape?.oblateness ?? 0);

  const pRings = p.planet.rings;
  r.planetRingsEnabled.checked = Boolean(pRings);
  const pRingInnerDefault = p.planet.r * 1.4;
  const pRingOuterDefault = p.planet.r * 2.2;
  writeNumberInput(r.planetRingInner, pRings?.innerRadius ?? pRingInnerDefault);
  writeNumberInput(r.planetRingOuter, pRings?.outerRadius ?? pRingOuterDefault);
  writeNumberInput(
    r.planetRingInc,
    Number.isFinite(pRings?.inclination ?? Number.NaN) ? (pRings!.inclination as number) * RAD2DEG : 0,
  );
  writeNumberInput(
    r.planetRingAngle,
    Number.isFinite(pRings?.positionAngle ?? Number.NaN) ? (pRings!.positionAngle as number) * RAD2DEG : 0,
  );

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
  r.atmLambdaNm.value = formatNumberList(ph?.atmosphereTransmission?.lambdaNm);
  r.atmTauScale.value = formatNumberList(ph?.atmosphereTransmission?.tauScale);

  // --- Moon ---
  r.moonEnabled.checked = Boolean(p.moon);

  if (p.moon) {
    if (typeof (p.moon as any).orbitAroundPlanet === "function") {
      throw new Error(
        "UI does not support a function-valued moon.orbitAroundPlanet (OrbitElementsProvider).",
      );
    }

    writeNumberInput(r.moonR, p.moon.r);
    writeOrbitInputs(
      { a: r.moonA, e: r.moonE, inc: r.moonInc, period: r.moonPeriod },
      p.moon.orbitAroundPlanet as any,
    );
    writeNumberInput(r.moonMass, (p.moon.m ?? 0) as number);
  } else {
    // Provide stable defaults so controls don't show NaN when disabled.
    writeNumberInput(r.moonR, 1);
    writeOrbitInputs(
      { a: r.moonA, e: r.moonE, inc: r.moonInc, period: r.moonPeriod },
      { a: 10, e: 0, inc: 0, period: 1000 },
    );
    writeNumberInput(r.moonMass, 0);
  }

  r.moonPhaseEnabled.checked = Boolean(ph?.moonPhaseCurve?.enabled);
  writeNumberInput(r.moonReflAmp, ph?.moonPhaseCurve?.reflAmp ?? 0);
  writeNumberInput(r.moonThermAmp, ph?.moonPhaseCurve?.thermAmp ?? 0);
  r.moonLambertian.checked = Boolean(ph?.moonPhaseCurve?.lambertian ?? true);

  const mThermal = ph?.moonPhaseCurve?.thermalInertia;
  r.moonThermalInertiaEnabled.checked = Boolean(mThermal?.enabled);
  writeNumberInput(r.moonAlbedo, mThermal?.albedo ?? 0);
  writeNumberInput(r.moonEmissivity, mThermal?.emissivity ?? 1);
  writeNumberInput(r.moonThermalTimescale, mThermal?.thermalTimescaleSec ?? 0);
  writeNumberInput(r.moonRedistribution, mThermal?.redistribution ?? 0);

  // Moon shape / rings
  const mShape = p.moon?.shape;
  r.moonOblateEnabled.checked = Boolean(
    mShape && Number.isFinite(mShape.oblateness ?? Number.NaN) && (mShape.oblateness as number) > 0,
  );
  writeNumberInput(r.moonOblateness, mShape?.oblateness ?? 0);

  const mRings = p.moon?.rings;
  r.moonRingsEnabled.checked = Boolean(mRings);
  const mRingInnerDefault = (p.moon?.r ?? 1) * 1.4;
  const mRingOuterDefault = (p.moon?.r ?? 1) * 2.0;
  writeNumberInput(r.moonRingInner, mRings?.innerRadius ?? mRingInnerDefault);
  writeNumberInput(r.moonRingOuter, mRings?.outerRadius ?? mRingOuterDefault);
  writeNumberInput(
    r.moonRingInc,
    Number.isFinite(mRings?.inclination ?? Number.NaN) ? (mRings!.inclination as number) * RAD2DEG : 0,
  );
  writeNumberInput(
    r.moonRingAngle,
    Number.isFinite(mRings?.positionAngle ?? Number.NaN) ? (mRings!.positionAngle as number) * RAD2DEG : 0,
  );

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

  // --- N-body dynamics ---
  const nbody = (p as any).dynamics?.nbodyPlanetMoon;
  r.nbodyEnabled.checked = Boolean(nbody?.enabled);

  const starM = p.star?.m;
  const planetM = p.planet?.m;
  const moonM = p.moon?.m;
  const planetOrbitStatic = typeof p.planet.orbit === "function" ? undefined : (p.planet.orbit as any);
  const moonOrbitStatic =
    p.moon && typeof p.moon.orbitAroundPlanet === "function" ? undefined : (p.moon?.orbitAroundPlanet as any);

  const muStarDefault =
    nbody?.muStar ??
    (Number.isFinite(starM ?? Number.NaN) && (starM as number) > 0
      ? (starM as number)
      : estimateMuFromOrbit(planetOrbitStatic));
  const muPlanetDefault =
    nbody?.muPlanet ??
    (Number.isFinite(planetM ?? Number.NaN) && (planetM as number) > 0
      ? (planetM as number)
      : estimateMuFromOrbit(moonOrbitStatic));
  const muMoonDefault =
    nbody?.muMoon ?? (Number.isFinite(moonM ?? Number.NaN) && (moonM as number) > 0 ? (moonM as number) : 0);

  writeNumberInput(r.nbodyMuStar, muStarDefault ?? 1);
  writeNumberInput(r.nbodyMuPlanet, muPlanetDefault ?? 0.1);
  writeNumberInput(r.nbodyMuMoon, muMoonDefault ?? 0.01);
  writeNumberInput(r.nbodyDtMax, nbody?.dtMax ?? 10);
  writeNumberInput(r.nbodySoftening, nbody?.softening ?? 0);

  const pert = Array.isArray(nbody?.perturbers) ? nbody!.perturbers! : [];
  writePerturberInputs(
    {
      enabled: r.pert1Enabled,
      mu: r.pert1Mu,
      a: r.pert1A,
      e: r.pert1E,
      incDeg: r.pert1Inc,
      period: r.pert1Period,
    },
    pert[0],
    { mu: 0, a: 400, e: 0, incDeg: 0, period: 40000 },
  );
  writePerturberInputs(
    {
      enabled: r.pert2Enabled,
      mu: r.pert2Mu,
      a: r.pert2A,
      e: r.pert2E,
      incDeg: r.pert2Inc,
      period: r.pert2Period,
    },
    pert[1],
    { mu: 0, a: 600, e: 0, incDeg: 0, period: 70000 },
  );

  // --- Relativity (LTTE/GR) ---
  const rel = (p as any).dynamics?.relativity;
  r.relEnabled.checked = Boolean(rel?.enabled);
  r.relLTTE.checked = Boolean(rel?.ltte ?? true);
  r.relShapiro.checked = Boolean(rel?.shapiro ?? true);
  r.relGR.checked = Boolean(rel?.grPrecession ?? true);
  writeNumberInput(r.relC, rel?.c ?? 299792.458);
  writeNumberInput(
    r.relPlanetPrec,
    Number.isFinite(rel?.planetPrecessionPerOrbit ?? Number.NaN)
      ? (rel!.planetPrecessionPerOrbit as number) * RAD2DEG
      : 0,
  );
  writeNumberInput(
    r.relMoonPrec,
    Number.isFinite(rel?.moonPrecessionPerOrbit ?? Number.NaN)
      ? (rel!.moonPrecessionPerOrbit as number) * RAD2DEG
      : 0,
  );
}

export function readUIIntoParams(
  current: SystemParams,
  r: UiRefs,
  scenarioDefaults: SystemParams,
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
    const bandpassRaw = r.ldBandpass.value.trim();
    const bandsText = r.ldBands.value ?? "";
    const bands = bandsText.trim().length > 0 ? parseQuadraticBands(bandsText) : undefined;

    ph.limbDarkeningModel = {
      ...(prevModel as any),
      bandpass: bandpassRaw.length > 0 ? bandpassRaw : undefined,
      default: { kind: "quadratic", u1, u2 },
      bands,
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

  // Spot evolution (uses brightnessPatches)
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
    } as any;
  } else {
    delete ph.spotEvolution;
  }

  // PLANET
  next.planet.r = sanitizePositive(readNumberInput(r.planetR, next.planet.r), 0.001, 1e6);

  if (typeof (next.planet as any).orbit === "function") {
    throw new Error("UI does not support a function-valued planet.orbit (OrbitElementsProvider).");
  }

  const pOrbit = next.planet.orbit as any;
  readOrbitInputs({ a: r.planetA, e: r.planetE, inc: r.planetInc, period: r.planetPeriod }, pOrbit);

  next.planet.m = sanitizePositive(readNumberInput(r.planetMass, (next.planet.m ?? 0) as number), 0, 1e30);

  // Planet shape / rings
  const pObl = readOblatenessInput(
    { enabled: r.planetOblateEnabled, oblateness: r.planetOblateness },
    next.planet.shape?.oblateness ?? 0,
  );
  if (pObl !== undefined) {
    next.planet.shape = {
      ...(next.planet.shape ?? ({} as any)),
      oblateness: pObl,
      angle: Number.isFinite(next.planet.shape?.angle ?? Number.NaN) ? next.planet.shape?.angle : 0,
    };
  } else if (next.planet.shape) {
    delete next.planet.shape;
  }

  const pRingDefaults = {
    inner: next.planet.r * 1.4,
    outer: next.planet.r * 2.2,
    incDeg: Number.isFinite(next.planet.rings?.inclination ?? Number.NaN)
      ? (next.planet.rings!.inclination as number) * RAD2DEG
      : 0,
    angleDeg: Number.isFinite(next.planet.rings?.positionAngle ?? Number.NaN)
      ? (next.planet.rings!.positionAngle as number) * RAD2DEG
      : 0,
  };
  const pRings = readRingInputs(
    {
      enabled: r.planetRingsEnabled,
      inner: r.planetRingInner,
      outer: r.planetRingOuter,
      incDeg: r.planetRingInc,
      angleDeg: r.planetRingAngle,
    },
    pRingDefaults,
  );
  if (pRings) {
    next.planet.rings = pRings as any;
  } else if (next.planet.rings) {
    delete next.planet.rings;
  }

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
      sigmaPhase: sanitizePositive(
        readNumberInput(r.fsSigma, ph.forwardScattering?.sigmaPhase ?? 0.12),
        1e-6,
        10,
      ),
      phaseOffset: sanitizeFinite(readNumberInput(r.fsOffset, ph.forwardScattering?.phaseOffset ?? 0), 0),
      gateWhenBehindStar: readCheckbox(r.fsGateBehind),
      clampNonNegative: true,
    } as any;
  } else {
    delete ph.forwardScattering;
  }

  // Atmosphere transmission
  if (readCheckbox(r.atmEnabled)) {
    const lambdaNm = parseNumberList(r.atmLambdaNm.value).filter((v) => v > 0);
    const tauScale = parseNumberList(r.atmTauScale.value).map((v) => Math.max(0, v));
    ph.atmosphereTransmission = {
      enabled: true,
      target: "planet",
      kind: readSelect(r.atmKind, "hard"),
      r0: sanitizePositive(readNumberInput(r.atmR0, ph.atmosphereTransmission?.r0 ?? 0), 0, 1e9),
      H: sanitizePositive(readNumberInput(r.atmH, ph.atmosphereTransmission?.H ?? 0), 0, 1e9),
      tau0: sanitizePositive(readNumberInput(r.atmTau0, ph.atmosphereTransmission?.tau0 ?? 0), 0, 1e12),
      lambdaNm: lambdaNm.length > 0 ? lambdaNm : undefined,
      tauScale: tauScale.length > 0 ? tauScale : undefined,
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
      throw new Error(
        "UI does not support a function-valued moon.orbitAroundPlanet (OrbitElementsProvider).",
      );
    }

    next.moon!.r = sanitizePositive(readNumberInput(r.moonR, next.moon!.r), 0.001, 1e6);

    const mOrbit = next.moon!.orbitAroundPlanet as any;
    readOrbitInputs({ a: r.moonA, e: r.moonE, inc: r.moonInc, period: r.moonPeriod }, mOrbit);

    next.moon!.m = sanitizePositive(readNumberInput(r.moonMass, (next.moon!.m ?? 0) as number), 0, 1e30);

    // Moon shape / rings
    const mObl = readOblatenessInput(
      { enabled: r.moonOblateEnabled, oblateness: r.moonOblateness },
      next.moon!.shape?.oblateness ?? 0,
    );
    if (mObl !== undefined) {
      next.moon!.shape = {
        ...(next.moon!.shape ?? ({} as any)),
        oblateness: mObl,
        angle: Number.isFinite(next.moon!.shape?.angle ?? Number.NaN) ? next.moon!.shape?.angle : 0,
      };
    } else if (next.moon!.shape) {
      delete next.moon!.shape;
    }

    const mRingDefaults = {
      inner: next.moon!.r * 1.4,
      outer: next.moon!.r * 2.0,
      incDeg: Number.isFinite(next.moon!.rings?.inclination ?? Number.NaN)
        ? (next.moon!.rings!.inclination as number) * RAD2DEG
        : 0,
      angleDeg: Number.isFinite(next.moon!.rings?.positionAngle ?? Number.NaN)
        ? (next.moon!.rings!.positionAngle as number) * RAD2DEG
        : 0,
    };
    const mRings = readRingInputs(
      {
        enabled: r.moonRingsEnabled,
        inner: r.moonRingInner,
        outer: r.moonRingOuter,
        incDeg: r.moonRingInc,
        angleDeg: r.moonRingAngle,
      },
      mRingDefaults,
    );
    if (mRings) {
      next.moon!.rings = mRings as any;
    } else if (next.moon!.rings) {
      delete next.moon!.rings;
    }
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
    } as any;
  } else {
    delete ph.moonPhaseCurve;
  }

  // Smearing params (measurement layer)
  if (readCheckbox(r.smearEnabled)) {
    ph.cadenceSec = sanitizePositive(readNumberInput(r.cadenceSec, ph.cadenceSec ?? 60), 0, 1e9);
    ph.nSubsamples = Math.floor(
      sanitizePositive(readNumberInput(r.nSubsamples, ph.nSubsamples ?? 9), 1, 4096),
    );
  } else {
    ph.cadenceSec = 0;
    ph.nSubsamples = 1;
  }

  // Stellar variability
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

  // N-body dynamics
  if (readCheckbox(r.nbodyEnabled) && readCheckbox(r.moonEnabled)) {
    next.dynamics = next.dynamics ?? ({} as any);
    const pert1 = readPerturberInputs(
      {
        enabled: r.pert1Enabled,
        mu: r.pert1Mu,
        a: r.pert1A,
        e: r.pert1E,
        incDeg: r.pert1Inc,
        period: r.pert1Period,
      },
      { mu: 0, a: 400, e: 0, incDeg: 0, period: 40000 },
    );
    const pert2 = readPerturberInputs(
      {
        enabled: r.pert2Enabled,
        mu: r.pert2Mu,
        a: r.pert2A,
        e: r.pert2E,
        incDeg: r.pert2Inc,
        period: r.pert2Period,
      },
      { mu: 0, a: 600, e: 0, incDeg: 0, period: 70000 },
    );

    (next.dynamics as any).nbodyPlanetMoon = {
      enabled: true,
      muStar: sanitizePositive(
        readNumberInput(r.nbodyMuStar, (next.dynamics as any).nbodyPlanetMoon?.muStar ?? 1),
        1e-12,
        1e30,
      ),
      muPlanet: sanitizePositive(
        readNumberInput(r.nbodyMuPlanet, (next.dynamics as any).nbodyPlanetMoon?.muPlanet ?? 0.1),
        1e-12,
        1e30,
      ),
      muMoon: sanitizePositive(
        readNumberInput(r.nbodyMuMoon, (next.dynamics as any).nbodyPlanetMoon?.muMoon ?? 0.01),
        1e-12,
        1e30,
      ),
      dtMax: sanitizePositive(
        readNumberInput(r.nbodyDtMax, (next.dynamics as any).nbodyPlanetMoon?.dtMax ?? 10),
        1e-6,
        1e12,
      ),
      softening: sanitizePositive(
        readNumberInput(r.nbodySoftening, (next.dynamics as any).nbodyPlanetMoon?.softening ?? 0),
        0,
        1e12,
      ),
      perturbers: [pert1, pert2].filter(Boolean),
    } as any;
  } else if (next.dynamics && (next.dynamics as any).nbodyPlanetMoon) {
    delete (next.dynamics as any).nbodyPlanetMoon;
  }

  // Relativity (LTTE/GR)
  if (readCheckbox(r.relEnabled)) {
    next.dynamics = next.dynamics ?? ({} as any);

    (next.dynamics as any).relativity = {
      enabled: true,
      ltte: readCheckbox(r.relLTTE),
      shapiro: readCheckbox(r.relShapiro),
      grPrecession: readCheckbox(r.relGR),
      c: sanitizePositive(
        readNumberInput(r.relC, (next.dynamics as any).relativity?.c ?? 299792.458),
        1e-9,
        1e30,
      ),
      planetPrecessionPerOrbit:
        sanitizeFinite(
          readNumberInput(r.relPlanetPrec, (next.dynamics as any).relativity?.planetPrecessionPerOrbit ?? 0),
          0,
        ) * DEG2RAD,
      moonPrecessionPerOrbit:
        sanitizeFinite(
          readNumberInput(r.relMoonPrec, (next.dynamics as any).relativity?.moonPrecessionPerOrbit ?? 0),
          0,
        ) * DEG2RAD,
    } as any;
  } else if (next.dynamics && (next.dynamics as any).relativity) {
    delete (next.dynamics as any).relativity;
  }

  // Exomoon timing/shape (dynamics hook)
  if (readCheckbox(r.exoEnabled)) {
    next.dynamics = next.dynamics ?? ({} as any);

    (next.dynamics as any).exomoonTimingShape = {
      enabled: true,
      tRef: sanitizeFinite(
        readNumberInput(r.exoTRef, (next.dynamics as any).exomoonTimingShape?.tRef ?? 0),
        0,
      ),
      velDt: sanitizePositive(
        readNumberInput(r.exoVelDt, (next.dynamics as any).exomoonTimingShape?.velDt ?? 2),
        1e-6,
        1e9,
      ),
      moonOmegaDot: sanitizeFinite(
        readNumberInput(r.exoMoonOmegaDot, (next.dynamics as any).exomoonTimingShape?.moonOmegaDot ?? 0),
        0,
      ),
      moonIncDot: sanitizeFinite(
        readNumberInput(r.exoMoonIncDot, (next.dynamics as any).exomoonTimingShape?.moonIncDot ?? 0),
        0,
      ),
      moonOmegaSmallDot: sanitizeFinite(
        readNumberInput(
          r.exoMoonOmegaSmallDot,
          (next.dynamics as any).exomoonTimingShape?.moonOmegaSmallDot ?? 0,
        ),
        0,
      ),
      moonImpactYDot: sanitizeFinite(
        readNumberInput(r.exoImpactYDot, (next.dynamics as any).exomoonTimingShape?.moonImpactYDot ?? 0),
        0,
      ),
    } as any;
  } else if (next.dynamics && (next.dynamics as any).exomoonTimingShape) {
    (next.dynamics as any).exomoonTimingShape.enabled = false;
  }

  return next;
}
