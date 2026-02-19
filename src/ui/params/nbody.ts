import type { SystemParams } from "../../core/types";
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

export const NBODY_MU_MIN = 1e-12;

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

export function loadNBodyIntoUI(p: SystemParams, r: UiRefs): void {
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
      ? G_SI * (starM as number)
      : estimateMuFromOrbit(planetOrbitStatic));
  const muPlanetDefault =
    nbody?.muPlanet ??
    (Number.isFinite(planetM ?? Number.NaN) && (planetM as number) > 0
      ? G_SI * (planetM as number)
      : estimateMuFromOrbit(moonOrbitStatic));
  const muMoonDefault =
    nbody?.muMoon ??
    (Number.isFinite(moonM ?? Number.NaN) && (moonM as number) > 0 ? G_SI * (moonM as number) : NBODY_MU_MIN);

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
    { mu: NBODY_MU_MIN, a: 400, e: 0, incDeg: 0, period: 40000 },
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
    { mu: NBODY_MU_MIN, a: 600, e: 0, incDeg: 0, period: 70000 },
  );
}

export function readNBodyFromUI(next: SystemParams, r: UiRefs): void {
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
      { mu: NBODY_MU_MIN, a: 400, e: 0, incDeg: 0, period: 40000 },
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
      { mu: NBODY_MU_MIN, a: 600, e: 0, incDeg: 0, period: 70000 },
    );

    (next.dynamics as any).nbodyPlanetMoon = {
      enabled: true,
      muStar: sanitizePositive(
        readNumberInput(r.nbodyMuStar, (next.dynamics as any).nbodyPlanetMoon?.muStar ?? 1),
        NBODY_MU_MIN,
        1e30,
      ),
      muPlanet: sanitizePositive(
        readNumberInput(r.nbodyMuPlanet, (next.dynamics as any).nbodyPlanetMoon?.muPlanet ?? 0.1),
        NBODY_MU_MIN,
        1e30,
      ),
      muMoon: sanitizePositive(
        readNumberInput(r.nbodyMuMoon, (next.dynamics as any).nbodyPlanetMoon?.muMoon ?? 0.01),
        NBODY_MU_MIN,
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
}
