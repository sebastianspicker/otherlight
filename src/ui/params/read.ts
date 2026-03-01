import type { SystemDynamicsParams, SystemParams } from "../../core/types";
import { DEG2RAD, RAD2DEG } from "../../core/units";
import { cloneParams } from "../../app/scenario";
import { readCheckbox, readNumberInput, sanitizeFinite, sanitizePositive } from "../inputs";
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

export function readUIIntoParams(
  current: SystemParams,
  r: UiRefs,
  scenarioDefaults: SystemParams,
): SystemParams {
  const next = cloneParams(current);

  setObserverDirFromUI(next, r);
  next.star.r = sanitizePositive(readNumberInput(r.starR, next.star.r), RADIUS_MIN, RADIUS_MAX);
  readPhotometryFromUI(next, r);

  next.planet.r = sanitizePositive(readNumberInput(r.planetR, next.planet.r), RADIUS_MIN, RADIUS_MAX);
  const pOrbit = next.planet.orbit;
  if (typeof pOrbit === "function") {
    throw new Error("UI does not support a function-valued planet.orbit (OrbitElementsProvider).");
  }
  readOrbitInputs({ a: r.planetA, e: r.planetE, inc: r.planetInc, period: r.planetPeriod }, pOrbit);
  next.planet.m = sanitizePositive(readNumberInput(r.planetMass, (next.planet.m ?? 0) as number), 0, 1e30);

  const pObl = readOblatenessInput(
    { enabled: r.planetOblateEnabled, oblateness: r.planetOblateness },
    next.planet.shape?.oblateness ?? 0,
  );
  if (pObl !== undefined) {
    next.planet.shape = {
      ...(next.planet.shape ?? {}),
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
    next.planet.rings = pRings;
  } else if (next.planet.rings) {
    delete next.planet.rings;
  }

  if (readCheckbox(r.moonEnabled)) {
    if (!next.moon) {
      const templateMoon = cloneParams(scenarioDefaults).moon;
      if (templateMoon) {
        next.moon = templateMoon;
      } else {
        next.moon = {
          r: 1e6,
          m: 0,
          orbitAroundPlanet: { a: 1e8, e: 0, inc: 0, Omega: 0, omega: 0, period: 1e5, t0: 0 },
        };
      }
    }

    const mOrbit = next.moon.orbitAroundPlanet;
    if (typeof mOrbit === "function") {
      throw new Error(
        "UI does not support a function-valued moon.orbitAroundPlanet (OrbitElementsProvider).",
      );
    }

    next.moon!.r = sanitizePositive(readNumberInput(r.moonR, next.moon!.r), RADIUS_MIN, RADIUS_MAX);
    readOrbitInputs({ a: r.moonA, e: r.moonE, inc: r.moonInc, period: r.moonPeriod }, mOrbit);
    next.moon!.m = sanitizePositive(readNumberInput(r.moonMass, (next.moon!.m ?? 0) as number), 0, 1e30);

    const mObl = readOblatenessInput(
      { enabled: r.moonOblateEnabled, oblateness: r.moonOblateness },
      next.moon!.shape?.oblateness ?? 0,
    );
    if (mObl !== undefined) {
      next.moon!.shape = {
        ...(next.moon!.shape ?? {}),
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
      next.moon!.rings = mRings;
    } else if (next.moon!.rings) {
      delete next.moon!.rings;
    }
  } else {
    delete next.moon;
  }

  readNBodyFromUI(next, r);

  if (readCheckbox(r.relEnabled)) {
    next.dynamics = next.dynamics ?? {};
    const dynamics = next.dynamics as SystemDynamicsParams;
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
          readNumberInput(r.relMoonPrec, (dynamics.relativity?.moonPrecessionPerOrbit ?? 0) * RAD2DEG),
          0,
        ) * DEG2RAD,
    };
  } else if (next.dynamics?.relativity) {
    delete next.dynamics.relativity;
  }

  if (readCheckbox(r.exoEnabled)) {
    next.dynamics = next.dynamics ?? {};
    const dynamics = next.dynamics as SystemDynamicsParams;
    dynamics.exomoonTimingShape = {
      enabled: true,
      tRef: sanitizeFinite(readNumberInput(r.exoTRef, dynamics.exomoonTimingShape?.tRef ?? 0), 0),
      velDt: sanitizePositive(
        readNumberInput(r.exoVelDt, dynamics.exomoonTimingShape?.velDt ?? 2),
        1e-6,
        1e9,
      ),
      moonOmegaDot: sanitizeFinite(
        readNumberInput(r.exoMoonOmegaDot, dynamics.exomoonTimingShape?.moonOmegaDot ?? 0),
        0,
      ),
      moonIncDot: sanitizeFinite(
        readNumberInput(r.exoMoonIncDot, dynamics.exomoonTimingShape?.moonIncDot ?? 0),
        0,
      ),
      moonOmegaSmallDot: sanitizeFinite(
        readNumberInput(r.exoMoonOmegaSmallDot, dynamics.exomoonTimingShape?.moonOmegaSmallDot ?? 0),
        0,
      ),
      moonImpactYDot: sanitizeFinite(
        readNumberInput(r.exoImpactYDot, dynamics.exomoonTimingShape?.moonImpactYDot ?? 0),
        0,
      ),
    };
  } else if (next.dynamics?.exomoonTimingShape) {
    delete next.dynamics.exomoonTimingShape;
  }

  return next;
}
