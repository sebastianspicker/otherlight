import type { SystemParams } from "../../core/types";
import { RAD2DEG } from "../../core/units";
import { writeNumberInput } from "../inputs";
import type { UiRefs } from "../refs";
import { writeOrbitInputs } from "./common";
import { loadNBodyIntoUI } from "./nbody";
import { loadPhotometryIntoUI } from "./photometry";

export function loadParamsIntoUI(p: SystemParams, r: UiRefs): void {
  const od = p.observer?.dir ?? { x: 0, y: 0, z: 1 };
  writeNumberInput(r.observerX, od.x);
  writeNumberInput(r.observerY, od.y);
  writeNumberInput(r.observerZ, od.z);

  writeNumberInput(r.starR, p.star.r);
  loadPhotometryIntoUI(p, r);

  writeNumberInput(r.planetR, p.planet.r);

  const pOrbit = p.planet.orbit;
  if (typeof pOrbit === "function") {
    throw new Error("UI does not support a function-valued planet.orbit (OrbitElementsProvider).");
  }
  writeOrbitInputs({ a: r.planetA, e: r.planetE, inc: r.planetInc, period: r.planetPeriod }, pOrbit);
  writeNumberInput(r.planetMass, (p.planet.m ?? 0) as number);

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

  r.moonEnabled.checked = Boolean(p.moon);
  if (p.moon) {
    const mOrbit = p.moon.orbitAroundPlanet;
    if (typeof mOrbit === "function") {
      throw new Error(
        "UI does not support a function-valued moon.orbitAroundPlanet (OrbitElementsProvider).",
      );
    }
    writeNumberInput(r.moonR, p.moon.r);
    writeOrbitInputs({ a: r.moonA, e: r.moonE, inc: r.moonInc, period: r.moonPeriod }, mOrbit);
    writeNumberInput(r.moonMass, (p.moon.m ?? 0) as number);
  } else {
    writeNumberInput(r.moonR, 1);
    writeOrbitInputs(
      { a: r.moonA, e: r.moonE, inc: r.moonInc, period: r.moonPeriod },
      { a: 10, e: 0, inc: 0, period: 1000 },
    );
    writeNumberInput(r.moonMass, 0);
  }

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

  const exo = p.dynamics?.exomoonTimingShape;
  r.exoEnabled.checked = Boolean(exo?.enabled);
  writeNumberInput(r.exoTRef, exo?.tRef ?? 0);
  writeNumberInput(r.exoVelDt, exo?.velDt ?? 2);
  writeNumberInput(r.exoMoonOmegaDot, exo?.moonOmegaDot ?? 0);
  writeNumberInput(r.exoMoonIncDot, exo?.moonIncDot ?? 0);
  writeNumberInput(r.exoMoonOmegaSmallDot, exo?.moonOmegaSmallDot ?? 0);
  writeNumberInput(r.exoImpactYDot, exo?.moonImpactYDot ?? 0);

  loadNBodyIntoUI(p, r);

  const rel = p.dynamics?.relativity;
  r.relEnabled.checked = Boolean(rel?.enabled);
  r.relLTTE.checked = Boolean(rel?.ltte ?? true);
  r.relShapiro.checked = Boolean(rel?.shapiro ?? true);
  r.relGR.checked = Boolean(rel?.grPrecession ?? true);
  writeNumberInput(r.relC, rel?.c ?? 299_792_458);
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
