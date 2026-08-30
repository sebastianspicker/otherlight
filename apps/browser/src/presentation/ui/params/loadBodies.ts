/**
 * Owns load Bodies support within the ui layer. Keeps DOM-facing behavior separate from application orchestration.
 */
import type { BrowserScenarioDraft } from "../../../domain/model/types";
import { RAD2DEG } from "../../../domain/model/units";
import { writeNumberInput } from "../inputs";
import type { UiRefs } from "../refs";
import { writeOrbitInputs } from "./common";

function valueOr<T>(value: T | undefined, fallback: T): T {
  return value === undefined ? fallback : value;
}

export function loadPlanetIntoUI(p: BrowserScenarioDraft, r: UiRefs): void {
  writeNumberInput(r.planetR, p.planet.r);

  const pOrbit = p.planet.orbit;
  if (typeof pOrbit === "function") {
    throw new Error("UI does not support a function-valued planet.orbit (OrbitElementsProvider).");
  }
  writeOrbitInputs({ a: r.planetA, e: r.planetE, inc: r.planetInc, period: r.planetPeriod }, pOrbit);
  writeNumberInput(r.planetMass, valueOr(p.planet.m, 0));
  loadPlanetShapeIntoUI(p, r);
  loadPlanetRingsIntoUI(p, r);
}

function loadPlanetShapeIntoUI(p: BrowserScenarioDraft, r: UiRefs): void {
  const pShape = p.planet.shape;
  r.planetOblateEnabled.checked = Boolean(
    pShape && Number.isFinite(valueOr(pShape.oblateness, Number.NaN)) && (pShape.oblateness as number) > 0,
  );
  writeNumberInput(r.planetOblateness, valueOr(pShape?.oblateness, 0));
}

function loadPlanetRingsIntoUI(p: BrowserScenarioDraft, r: UiRefs): void {
  const pRings = p.planet.rings;
  r.planetRingsEnabled.checked = Boolean(pRings);
  const pRingInnerDefault = p.planet.r * 1.4;
  const pRingOuterDefault = p.planet.r * 2.2;
  writeNumberInput(r.planetRingInner, valueOr(pRings?.innerRadius, pRingInnerDefault));
  writeNumberInput(r.planetRingOuter, valueOr(pRings?.outerRadius, pRingOuterDefault));
  writeNumberInput(r.planetRingInc, angleRadToDegOrZero(pRings?.inclination));
  writeNumberInput(r.planetRingAngle, angleRadToDegOrZero(pRings?.positionAngle));
}

export function loadMoonIntoUI(p: BrowserScenarioDraft, r: UiRefs): void {
  r.moonEnabled.checked = Boolean(p.moon);
  if (p.moon) {
    loadExistingMoonIntoUI(p.moon, r);
  } else {
    loadDefaultMoonInputs(r);
  }
  loadMoonShapeIntoUI(p, r);
  loadMoonRingsIntoUI(p, r);
}

function loadExistingMoonIntoUI(moon: NonNullable<BrowserScenarioDraft["moon"]>, r: UiRefs): void {
  const mOrbit = moon.orbitAroundPlanet;
  if (typeof mOrbit === "function") {
    throw new Error("UI does not support a function-valued moon.orbitAroundPlanet (OrbitElementsProvider).");
  }
  writeNumberInput(r.moonR, moon.r);
  writeOrbitInputs({ a: r.moonA, e: r.moonE, inc: r.moonInc, period: r.moonPeriod }, mOrbit);
  writeNumberInput(r.moonMass, valueOr(moon.m, 0));
}

function loadDefaultMoonInputs(r: UiRefs): void {
  writeNumberInput(r.moonR, 1);
  writeOrbitInputs(
    { a: r.moonA, e: r.moonE, inc: r.moonInc, period: r.moonPeriod },
    { a: 10, e: 0, inc: 0, period: 1000 },
  );
  writeNumberInput(r.moonMass, 0);
}

function loadMoonShapeIntoUI(p: BrowserScenarioDraft, r: UiRefs): void {
  const mShape = p.moon?.shape;
  r.moonOblateEnabled.checked = Boolean(
    mShape && Number.isFinite(valueOr(mShape.oblateness, Number.NaN)) && (mShape.oblateness as number) > 0,
  );
  writeNumberInput(r.moonOblateness, valueOr(mShape?.oblateness, 0));
}

function loadMoonRingsIntoUI(p: BrowserScenarioDraft, r: UiRefs): void {
  const mRings = p.moon?.rings;
  r.moonRingsEnabled.checked = Boolean(mRings);
  const moonRadius = valueOr(p.moon?.r, 1);
  writeNumberInput(r.moonRingInner, valueOr(mRings?.innerRadius, moonRadius * 1.4));
  writeNumberInput(r.moonRingOuter, valueOr(mRings?.outerRadius, moonRadius * 2.0));
  writeNumberInput(r.moonRingInc, angleRadToDegOrZero(mRings?.inclination));
  writeNumberInput(r.moonRingAngle, angleRadToDegOrZero(mRings?.positionAngle));
}

function angleRadToDegOrZero(angle: number | undefined): number {
  return Number.isFinite(valueOr(angle, Number.NaN)) ? (angle as number) * RAD2DEG : 0;
}
