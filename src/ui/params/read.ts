import type { SystemDynamicsParams, SystemParams } from "../../core/types";
import { DEG2RAD, RAD2DEG } from "../../core/units";
import { cloneParams } from "../../core/clone";
import { readCheckbox, readNumberInput, sanitizeFinite, sanitizePositive } from "../inputs";
import { readUiMode } from "../mode";
import type { UiRefs } from "../refs";
import {
  RADIUS_MAX,
  RADIUS_MIN,
  readOblatenessInput,
  readOrbitInputs,
  readRingInputs,
  setObserverDirFromUI,
} from "./common";
import { readNBodyFromUI } from "./nbody";
import { readPhotometryFromUI } from "./photometry";

type MoonParams = NonNullable<SystemParams["moon"]>;

function valueOr<T>(value: T | undefined, fallback: T): T {
  return value === undefined ? fallback : value;
}

export function readUIIntoParams(
  current: SystemParams,
  r: UiRefs,
  scenarioDefaults: SystemParams,
): SystemParams {
  const next = cloneParams(current);
  const uiMode = readUiMode(r.uiModeSelect.value);

  readObserverAndStar(next, r, uiMode);
  readPlanetFromUI(next, r);
  readMoonFromUI(next, r, scenarioDefaults);

  readPhotometryFromUI(next, r);

  readNBodyFromUI(next, r);

  readRelativityFromUI(next, r);
  readExomoonTimingFromUI(next, r);

  return next;
}

function readObserverAndStar(next: SystemParams, r: UiRefs, uiMode: ReturnType<typeof readUiMode>): void {
  setObserverDirFromUI(next, r, uiMode);
  next.star.r = sanitizePositive(readNumberInput(r.starR, next.star.r), RADIUS_MIN, RADIUS_MAX);
}

function readPlanetFromUI(next: SystemParams, r: UiRefs): void {
  next.planet.r = sanitizePositive(readNumberInput(r.planetR, next.planet.r), RADIUS_MIN, RADIUS_MAX);
  const pOrbit = next.planet.orbit;
  if (typeof pOrbit === "function") {
    throw new Error("UI does not support a function-valued planet.orbit (OrbitElementsProvider).");
  }
  readOrbitInputs({ a: r.planetA, e: r.planetE, inc: r.planetInc, period: r.planetPeriod }, pOrbit);
  next.planet.m = sanitizePositive(readNumberInput(r.planetMass, valueOr(next.planet.m, 0)), 0, 1e30);
  readPlanetShapeFromUI(next, r);
  readPlanetRingsFromUI(next, r);
}

function readPlanetShapeFromUI(next: SystemParams, r: UiRefs): void {
  const pObl = readOblatenessInput(
    { enabled: r.planetOblateEnabled, oblateness: r.planetOblateness },
    valueOr(next.planet.shape?.oblateness, 0),
  );
  if (pObl !== undefined) {
    next.planet.shape = {
      ...valueOr(next.planet.shape, {}),
      oblateness: pObl,
      angle: finiteAngleOrZero(next.planet.shape?.angle),
    };
    return;
  }
  if (next.planet.shape) delete next.planet.shape;
}

function readPlanetRingsFromUI(next: SystemParams, r: UiRefs): void {
  const pRings = readRingInputs(
    {
      enabled: r.planetRingsEnabled,
      inner: r.planetRingInner,
      outer: r.planetRingOuter,
      incDeg: r.planetRingInc,
      angleDeg: r.planetRingAngle,
    },
    ringDefaults(next.planet.r, 2.2, next.planet.rings),
  );
  if (pRings) {
    next.planet.rings = pRings;
    return;
  }
  if (next.planet.rings) delete next.planet.rings;
}

function readMoonFromUI(next: SystemParams, r: UiRefs, scenarioDefaults: SystemParams): void {
  if (!readCheckbox(r.moonEnabled)) {
    delete next.moon;
    return;
  }

  const moon = ensureMoon(next, scenarioDefaults);
  readMoonOrbitAndMassFromUI(moon, r);
  readMoonShapeFromUI(moon, r);
  readMoonRingsFromUI(moon, r);
}

function ensureMoon(next: SystemParams, scenarioDefaults: SystemParams): MoonParams {
  if (next.moon) return next.moon;
  const templateMoon = cloneParams(scenarioDefaults).moon;
  next.moon = valueOr(templateMoon, defaultMoon());
  return next.moon;
}

function defaultMoon(): MoonParams {
  return {
    r: 1e6,
    m: 0,
    orbitAroundPlanet: { a: 1e8, e: 0, inc: 0, Omega: 0, omega: 0, period: 1e5, t0: 0 },
  };
}

function readMoonOrbitAndMassFromUI(moon: MoonParams, r: UiRefs): void {
  const mOrbit = moon.orbitAroundPlanet;
  if (typeof mOrbit === "function") {
    throw new Error("UI does not support a function-valued moon.orbitAroundPlanet (OrbitElementsProvider).");
  }

  moon.r = sanitizePositive(readNumberInput(r.moonR, moon.r), RADIUS_MIN, RADIUS_MAX);
  readOrbitInputs({ a: r.moonA, e: r.moonE, inc: r.moonInc, period: r.moonPeriod }, mOrbit);
  moon.m = sanitizePositive(readNumberInput(r.moonMass, valueOr(moon.m, 0)), 0, 1e30);
}

function readMoonShapeFromUI(moon: MoonParams, r: UiRefs): void {
  const mObl = readOblatenessInput(
    { enabled: r.moonOblateEnabled, oblateness: r.moonOblateness },
    valueOr(moon.shape?.oblateness, 0),
  );
  if (mObl !== undefined) {
    moon.shape = {
      ...valueOr(moon.shape, {}),
      oblateness: mObl,
      angle: finiteAngleOrZero(moon.shape?.angle),
    };
    return;
  }
  if (moon.shape) delete moon.shape;
}

function readMoonRingsFromUI(moon: MoonParams, r: UiRefs): void {
  const mRings = readRingInputs(
    {
      enabled: r.moonRingsEnabled,
      inner: r.moonRingInner,
      outer: r.moonRingOuter,
      incDeg: r.moonRingInc,
      angleDeg: r.moonRingAngle,
    },
    ringDefaults(moon.r, 2.0, moon.rings),
  );
  if (mRings) {
    moon.rings = mRings;
    return;
  }
  if (moon.rings) delete moon.rings;
}

function finiteAngleOrZero(angle: number | undefined): number {
  return Number.isFinite(valueOr(angle, Number.NaN)) ? (angle as number) : 0;
}

function ringDefaults(
  radius: number,
  outerScale: number,
  rings: { inclination?: number; positionAngle?: number } | undefined,
): { inner: number; outer: number; incDeg: number; angleDeg: number } {
  return {
    inner: radius * 1.4,
    outer: radius * outerScale,
    incDeg: angleRadToDegOrZero(rings?.inclination),
    angleDeg: angleRadToDegOrZero(rings?.positionAngle),
  };
}

function angleRadToDegOrZero(angle: number | undefined): number {
  return Number.isFinite(valueOr(angle, Number.NaN)) ? (angle as number) * RAD2DEG : 0;
}

function ensureDynamics(next: SystemParams): SystemDynamicsParams {
  const dynamics = valueOr(next.dynamics, {} as SystemDynamicsParams);
  next.dynamics = dynamics;
  return dynamics;
}

function readRelativityFromUI(next: SystemParams, r: UiRefs): void {
  if (readCheckbox(r.relEnabled)) {
    const dynamics = ensureDynamics(next);
    dynamics.relativity = {
      enabled: true,
      ltte: readCheckbox(r.relLTTE),
      shapiro: readCheckbox(r.relShapiro),
      grPrecession: readCheckbox(r.relGR),
      c: sanitizePositive(readNumberInput(r.relC, dynamics.relativity?.c ?? 299_792_458), 1e-9, 1e30),
      planetPrecessionPerOrbit:
        sanitizeFinite(
          readNumberInput(r.relPlanetPrec, (dynamics.relativity?.planetPrecessionPerOrbit ?? 0) * RAD2DEG),
          0,
        ) * DEG2RAD,
      moonPrecessionPerOrbit:
        sanitizeFinite(
          readNumberInput(r.relMoonPrec, valueOr(dynamics.relativity?.moonPrecessionPerOrbit, 0) * RAD2DEG),
          0,
        ) * DEG2RAD,
    };
    return;
  }
  if (next.dynamics?.relativity) delete next.dynamics.relativity;
}

function readExomoonTimingFromUI(next: SystemParams, r: UiRefs): void {
  if (readCheckbox(r.exoEnabled)) {
    const dynamics = ensureDynamics(next);
    dynamics.exomoonTimingShape = readExomoonTimingShapeFromUI(r, dynamics.exomoonTimingShape);
    return;
  }
  if (next.dynamics?.exomoonTimingShape) delete next.dynamics.exomoonTimingShape;
}

function readExomoonTimingShapeFromUI(
  r: UiRefs,
  prev: SystemDynamicsParams["exomoonTimingShape"],
): SystemDynamicsParams["exomoonTimingShape"] {
  return {
    enabled: true,
    tRef: sanitizeFinite(readNumberInput(r.exoTRef, valueOr(prev?.tRef, 0)), 0),
    velDt: sanitizePositive(readNumberInput(r.exoVelDt, valueOr(prev?.velDt, 2)), 1e-6, 1e9),
    moonOmegaDot: sanitizeFinite(readNumberInput(r.exoMoonOmegaDot, valueOr(prev?.moonOmegaDot, 0)), 0),
    moonIncDot: sanitizeFinite(readNumberInput(r.exoMoonIncDot, valueOr(prev?.moonIncDot, 0)), 0),
    moonOmegaSmallDot: sanitizeFinite(
      readNumberInput(r.exoMoonOmegaSmallDot, valueOr(prev?.moonOmegaSmallDot, 0)),
      0,
    ),
    moonImpactYDot: sanitizeFinite(readNumberInput(r.exoImpactYDot, valueOr(prev?.moonImpactYDot, 0)), 0),
  };
}
