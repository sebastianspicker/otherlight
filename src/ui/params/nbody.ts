import type {
  NBodyPerturberParams,
  NBodyPlanetMoonParams,
  OrbitElements,
  OrbitElementsProvider,
  SystemDynamicsParams,
  SystemParams,
} from "../../core/types";
import { DEG2RAD, G_SI, RAD2DEG } from "../../core/units";
import {
  readCheckbox,
  readNumberInput,
  sanitizeEcc,
  sanitizeIncDeg,
  sanitizePositive,
  writeNumberInput,
} from "../inputs";
import type { UiRefs } from "../refs";
import { ORBIT_A_MAX, ORBIT_A_MIN, ORBIT_PERIOD_MAX, ORBIT_PERIOD_MIN } from "./common";

const NBODY_MU_MIN = 1e-12;

type PerturberInputRefs = {
  enabled: HTMLInputElement;
  mu: HTMLInputElement;
  a: HTMLInputElement;
  e: HTMLInputElement;
  incDeg: HTMLInputElement;
  period: HTMLInputElement;
};

type PerturberDefaults = {
  mu: number;
  a: number;
  e: number;
  incDeg: number;
  period: number;
};

type ReadPerturberConfig = {
  enabled: true;
  mu: number;
  orbit: { a: number; e: number; inc: number; Omega: number; omega: number; period: number; t0: number };
};

const PERTURBER_1_DEFAULTS: PerturberDefaults = { mu: NBODY_MU_MIN, a: 400, e: 0, incDeg: 0, period: 40000 };
const PERTURBER_2_DEFAULTS: PerturberDefaults = { mu: NBODY_MU_MIN, a: 600, e: 0, incDeg: 0, period: 70000 };

function estimateMuFromOrbit(orbit: { a: number; period: number } | undefined): number | undefined {
  if (!orbit) return undefined;
  const a = orbit.a;
  const p = orbit.period;
  if (!(Number.isFinite(a) && a > 0 && Number.isFinite(p) && p > 0)) return undefined;
  const n = (2 * Math.PI) / p;
  const mu = n * n * a * a * a;
  return Number.isFinite(mu) ? mu : undefined;
}

function valueOr<T>(value: T | undefined, fallback: T): T {
  return value === undefined ? fallback : value;
}

function staticOrbit(orbit: OrbitElements | OrbitElementsProvider | undefined): OrbitElements | undefined {
  if (!orbit || typeof orbit === "function") return undefined;
  return orbit;
}

function finitePositiveMuFromMass(mass: number | undefined): number | undefined {
  if (!Number.isFinite(mass) || (mass as number) <= 0) return undefined;
  return G_SI * (mass as number);
}

function resolveDefaultMu(
  configuredMu: number | undefined,
  mass: number | undefined,
  orbit: { a: number; period: number } | undefined,
  fallback: number,
): number {
  if (configuredMu !== undefined) return configuredMu;
  const massMu = finitePositiveMuFromMass(mass);
  if (massMu !== undefined) return massMu;
  return valueOr(estimateMuFromOrbit(orbit), fallback);
}

function orbitIncDeg(orbit: OrbitElements | undefined, fallback: number): number {
  return Number.isFinite(orbit?.inc) ? (orbit!.inc as number) * RAD2DEG : fallback;
}

function isPerturberEnabled(p: NBodyPerturberParams | undefined): boolean {
  return Boolean(p && p.enabled !== false);
}

function writePerturberInputs(
  refs: PerturberInputRefs,
  p: NBodyPerturberParams | undefined,
  defaults: PerturberDefaults,
): void {
  const perturber = valueOr(p, {});
  const orbit = staticOrbit(perturber.orbit);
  refs.enabled.checked = isPerturberEnabled(p);
  writeNumberInput(refs.mu, valueOr(perturber.mu, defaults.mu));
  writeNumberInput(refs.a, valueOr(orbit?.a, defaults.a));
  writeNumberInput(refs.e, valueOr(orbit?.e, defaults.e));
  writeNumberInput(refs.incDeg, orbitIncDeg(orbit, defaults.incDeg));
  writeNumberInput(refs.period, valueOr(orbit?.period, defaults.period));
}

function readPerturberInputs(
  refs: PerturberInputRefs,
  defaults: PerturberDefaults,
): ReadPerturberConfig | undefined {
  if (!readCheckbox(refs.enabled)) return undefined;

  const mu = sanitizePositive(readNumberInput(refs.mu, defaults.mu), NBODY_MU_MIN, 1e30);
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

function perturber1Refs(r: UiRefs): PerturberInputRefs {
  return {
    enabled: r.pert1Enabled,
    mu: r.pert1Mu,
    a: r.pert1A,
    e: r.pert1E,
    incDeg: r.pert1Inc,
    period: r.pert1Period,
  };
}

function perturber2Refs(r: UiRefs): PerturberInputRefs {
  return {
    enabled: r.pert2Enabled,
    mu: r.pert2Mu,
    a: r.pert2A,
    e: r.pert2E,
    incDeg: r.pert2Inc,
    period: r.pert2Period,
  };
}

function nbodyPerturbers(nbody: NBodyPlanetMoonParams | undefined): NBodyPerturberParams[] {
  return Array.isArray(nbody?.perturbers) ? nbody.perturbers : [];
}

function resolvedNBodyDefaults(
  p: SystemParams,
  nbody: NBodyPlanetMoonParams | undefined,
): { muStar: number; muPlanet: number; muMoon: number } {
  const planetOrbitStatic = staticOrbit(p.planet.orbit);
  const moonOrbitStatic = staticOrbit(p.moon?.orbitAroundPlanet);
  return {
    muStar: resolveDefaultMu(nbody?.muStar, p.star?.m, planetOrbitStatic, 1),
    muPlanet: resolveDefaultMu(nbody?.muPlanet, p.planet?.m, moonOrbitStatic, 0.1),
    muMoon: resolveDefaultMu(nbody?.muMoon, p.moon?.m, undefined, 0.01),
  };
}

function writeNBodyScalarInputs(
  r: UiRefs,
  nbody: NBodyPlanetMoonParams | undefined,
  defaults: { muStar: number; muPlanet: number; muMoon: number },
): void {
  writeNumberInput(r.nbodyMuStar, defaults.muStar);
  writeNumberInput(r.nbodyMuPlanet, defaults.muPlanet);
  writeNumberInput(r.nbodyMuMoon, defaults.muMoon);
  writeNumberInput(r.nbodyDtMax, valueOr(nbody?.dtMax, 10));
  writeNumberInput(r.nbodySoftening, valueOr(nbody?.softening, 0));
}

export function loadNBodyIntoUI(p: SystemParams, r: UiRefs): void {
  const nbody = p.dynamics?.nbodyPlanetMoon;
  r.nbodyEnabled.checked = Boolean(nbody?.enabled);

  writeNBodyScalarInputs(r, nbody, resolvedNBodyDefaults(p, nbody));
  const pert = nbodyPerturbers(nbody);
  writePerturberInputs(perturber1Refs(r), pert[0], PERTURBER_1_DEFAULTS);
  writePerturberInputs(perturber2Refs(r), pert[1], PERTURBER_2_DEFAULTS);
}

function shouldReadNBody(r: UiRefs): boolean {
  return readCheckbox(r.nbodyEnabled) && readCheckbox(r.moonEnabled);
}

function ensureDynamics(next: SystemParams): SystemDynamicsParams {
  const dynamics = valueOr(next.dynamics, {} as SystemDynamicsParams);
  next.dynamics = dynamics;
  return dynamics;
}

function readPerturbersFromUI(r: UiRefs): ReadPerturberConfig[] {
  const pert1 = readPerturberInputs(perturber1Refs(r), PERTURBER_1_DEFAULTS);
  const pert2 = readPerturberInputs(perturber2Refs(r), PERTURBER_2_DEFAULTS);
  return [pert1, pert2].filter((p): p is ReadPerturberConfig => p != null);
}

function buildNBodyConfigFromUI(r: UiRefs, prev: NBodyPlanetMoonParams | undefined): NBodyPlanetMoonParams {
  return {
    enabled: true,
    muStar: sanitizePositive(readNumberInput(r.nbodyMuStar, valueOr(prev?.muStar, 1)), NBODY_MU_MIN, 1e30),
    muPlanet: sanitizePositive(
      readNumberInput(r.nbodyMuPlanet, valueOr(prev?.muPlanet, 0.1)),
      NBODY_MU_MIN,
      1e30,
    ),
    muMoon: sanitizePositive(readNumberInput(r.nbodyMuMoon, valueOr(prev?.muMoon, 0.01)), NBODY_MU_MIN, 1e30),
    dtMax: sanitizePositive(readNumberInput(r.nbodyDtMax, valueOr(prev?.dtMax, 10)), 1e-6, 1e12),
    softening: sanitizePositive(readNumberInput(r.nbodySoftening, valueOr(prev?.softening, 0)), 0, 1e12),
    perturbers: readPerturbersFromUI(r),
  };
}

export function readNBodyFromUI(next: SystemParams, r: UiRefs): void {
  if (!shouldReadNBody(r)) {
    if (next.dynamics?.nbodyPlanetMoon) {
      delete next.dynamics.nbodyPlanetMoon;
    }
    return;
  }

  const dynamics = ensureDynamics(next);
  dynamics.nbodyPlanetMoon = buildNBodyConfigFromUI(r, dynamics.nbodyPlanetMoon);
}
