import type { OrbitElements, SystemParams } from "../../core/types";
import { validateSystemParamsPhysics } from "../../physics/hill";
import type { UiValidationMessage } from "./types";

/**
 * Collect non-fatal parameter warnings for UI display.
 * These are soft checks meant to flag likely unphysical or numerically risky setups.
 */
export function collectParamWarnings(params: SystemParams): UiValidationMessage[] {
  const out: UiValidationMessage[] = [...validateSystemParamsPhysics(params)];

  const starR = params.star?.r;
  const planet = params.planet;
  const pOrbit = planet && typeof planet.orbit !== "function" ? (planet.orbit as OrbitElements) : undefined;

  if (planet && pOrbit && Number.isFinite(pOrbit.a) && Number.isFinite(pOrbit.e)) {
    const eP = pOrbit.e;
    const aP = pOrbit.a;

    if (eP >= 0.95 && eP < 1) {
      out.push({
        severity: "warn",
        code: "HIGH_ECC_PLANET",
        message: `High planetary eccentricity (e=${eP.toFixed(3)}). Periastron handling may be numerically stiff.`,
      });
    }

    if (Number.isFinite(starR) && starR > 0) {
      const qP = aP * (1 - eP);
      if (Number.isFinite(qP) && qP <= starR) {
        out.push({
          severity: "warn",
          code: "PLANET_PERIA_INSIDE_STAR",
          message: "Planet periapsis is inside the stellar radius (collision/non-physical).",
        });
      }

      if (Number.isFinite(planet.r) && planet.r > 0 && planet.r >= starR) {
        out.push({
          severity: "warn",
          code: "PLANET_LARGER_THAN_STAR",
          message: "Planet radius is >= stellar radius; typically non-physical.",
        });
      }
    }
  }

  const moon = params.moon;
  const mOrbit =
    moon && typeof moon.orbitAroundPlanet !== "function"
      ? (moon.orbitAroundPlanet as OrbitElements)
      : undefined;
  if (moon && mOrbit && Number.isFinite(mOrbit.a) && Number.isFinite(mOrbit.e)) {
    const eM = mOrbit.e;
    const aM = mOrbit.a;

    if (eM >= 0.95 && eM < 1) {
      out.push({
        severity: "warn",
        code: "HIGH_ECC_MOON",
        message: `High moon eccentricity (e=${eM.toFixed(3)}). Pericenter may become non-physical.`,
      });
    }

    if (planet && Number.isFinite(planet.r) && planet.r > 0) {
      const qM = aM * (1 - eM);
      if (Number.isFinite(qM) && qM <= planet.r) {
        out.push({
          severity: "warn",
          code: "MOON_PERIA_INSIDE_PLANET",
          message: "Moon pericenter is inside the planet radius (collision/non-physical).",
        });
      }
    }

    if (planet && Number.isFinite(moon.r) && Number.isFinite(planet.r) && moon.r >= planet.r) {
      out.push({
        severity: "warn",
        code: "MOON_LARGER_THAN_PLANET",
        message: "Moon radius is >= planet radius; typically non-physical.",
      });
    }

    if (planet && Number.isFinite(planet.r) && planet.r > 0 && Number.isFinite(moon.r) && moon.r > 0) {
      const mPlanet = planet.m;
      const mMoon = moon.m;
      if (Number.isFinite(mPlanet ?? Number.NaN) && (mPlanet as number) > 0) {
        if (Number.isFinite(mMoon ?? Number.NaN) && (mMoon as number) > 0) {
          const rhoPlanet = (3 * (mPlanet as number)) / (4 * Math.PI * Math.pow(planet.r, 3));
          const rhoMoon = (3 * (mMoon as number)) / (4 * Math.PI * Math.pow(moon.r, 3));
          if (Number.isFinite(rhoPlanet) && rhoPlanet > 0 && Number.isFinite(rhoMoon) && rhoMoon > 0) {
            // Fluid Roche limit (approx): 2.44 * Rp * (rho_p / rho_m)^(1/3)
            const roche = 2.44 * planet.r * Math.cbrt(rhoPlanet / rhoMoon);
            const qM = aM * (1 - eM);
            if (Number.isFinite(qM) && Number.isFinite(roche) && qM < roche) {
              out.push({
                severity: "warn",
                code: "MOON_ROCHE_LIMIT",
                message: "Moon pericenter is inside the Roche limit (fluid satellite approximation).",
                details: { qM, roche },
              });
            }
          }
        }
      }
    }
  }

  const nbodyCfg = params.dynamics?.nbodyPlanetMoon;
  if (nbodyCfg?.enabled) {
    const dtMaxRaw = nbodyCfg.dtMax;
    if (typeof dtMaxRaw === "number" && Number.isFinite(dtMaxRaw) && dtMaxRaw > 0) {
      const periods: Array<{ label: string; period: number }> = [];
      if (pOrbit && Number.isFinite(pOrbit.period) && pOrbit.period > 0) {
        periods.push({ label: "planet", period: pOrbit.period });
      }
      if (mOrbit && Number.isFinite(mOrbit.period) && mOrbit.period > 0) {
        periods.push({ label: "moon", period: mOrbit.period });
      }

      if (periods.length > 0) {
        const shortest = periods.reduce((a, b) => (a.period <= b.period ? a : b));
        const steps = shortest.period / dtMaxRaw;
        if (Number.isFinite(steps) && steps < 50) {
          out.push({
            severity: "warn",
            code: "NBODY_DT_COARSE",
            message: `N-body dtMax is coarse relative to the ${shortest.label} period (~${steps.toFixed(
              1,
            )} steps/orbit). Stability may degrade.`,
            details: { dtMax: dtMaxRaw, period: shortest.period, steps },
          });
        }
      }
    }
  }

  const phot = params.star?.photometry;
  const gridRes = phot?.gridRes;
  if (Number.isFinite(gridRes ?? Number.NaN) && (gridRes as number) > 0 && (gridRes as number) < 40) {
    out.push({
      severity: "info",
      code: "LOW_GRID_RES",
      message: "gridRes is very low; transit accuracy may degrade.",
    });
  }

  if (phot?.spotEvolution?.enabled) {
    const hasPatches = Array.isArray(phot.brightnessPatches) && phot.brightnessPatches.length > 0;
    if (!hasPatches) {
      out.push({
        severity: "info",
        code: "SPOT_EVOLUTION_NO_PATCHES",
        message: "Spot evolution is enabled, but no brightness patches are configured.",
      });
    }
  }

  const nbody = params.dynamics?.nbodyPlanetMoon;
  const exo = params.dynamics?.exomoonTimingShape;
  if (nbody?.enabled && exo?.enabled) {
    out.push({
      severity: "info",
      code: "NBODY_EXO_OVERRIDES",
      message: "N-body is enabled; exomoon timing/shape is ignored for moon orbital evolution.",
    });
  }

  const rel = params.dynamics?.relativity;
  if (nbody?.enabled && rel?.enabled && rel.grPrecession !== false) {
    const planetOverride =
      Number.isFinite(rel.planetPrecessionPerOrbit) && rel.planetPrecessionPerOrbit !== 0;
    const moonOverride = Number.isFinite(rel.moonPrecessionPerOrbit) && rel.moonPrecessionPerOrbit !== 0;
    if (planetOverride || moonOverride) {
      out.push({
        severity: "info",
        code: "NBODY_GR_OVERRIDE_IGNORED",
        message: "N-body is enabled; GR uses a star-centric 1PN correction. Per-orbit overrides are ignored.",
      });
    }
  }

  const atm = phot?.atmosphereTransmission;
  if (atm?.enabled) {
    const lambdaNm = Array.isArray(atm.lambdaNm) ? atm.lambdaNm : [];
    const tauScale = Array.isArray(atm.tauScale) ? atm.tauScale : [];
    if (lambdaNm.length > 0 && tauScale.length > 1 && tauScale.length !== lambdaNm.length) {
      out.push({
        severity: "info",
        code: "ATM_LAMBDA_TAUSCALE_MISMATCH",
        message: "lambdaNm and tauScale have different lengths; tauScale defaults to 1.0.",
      });
    }
  }

  const cadenceSec = phot?.cadenceSec;
  const nSub = phot?.nSubsamples;
  if (
    Number.isFinite(cadenceSec ?? Number.NaN) &&
    (cadenceSec as number) > 0 &&
    Number.isFinite(nSub ?? Number.NaN) &&
    (nSub as number) <= 1
  ) {
    out.push({
      severity: "info",
      code: "SMEARING_DISABLED",
      message: "cadenceSec > 0 but nSubsamples <= 1; smearing is effectively disabled.",
    });
  }

  return out;
}
