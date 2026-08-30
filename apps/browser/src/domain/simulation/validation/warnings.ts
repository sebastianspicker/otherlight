/**
 * Owns warnings support within the sim layer. Keeps simulation state and numerical execution separate from UI coordination.
 */
import type { OrbitElements, BrowserScenarioDraft } from "../../model/types";
import { validateSystemParamsPhysics } from "../../orbits/hill";
import type { UiValidationMessage } from "./types";

type PlanetParams = BrowserScenarioDraft["planet"];
type MoonParams = NonNullable<BrowserScenarioDraft["moon"]>;
type PhotometryConfig = BrowserScenarioDraft["star"]["photometry"];

/**
 * Collect non-fatal parameter warnings for UI display.
 * These are soft checks meant to flag likely unphysical or numerically risky setups.
 */
export function collectParamWarnings(params: BrowserScenarioDraft): UiValidationMessage[] {
  const pOrbit = staticOrbit(params.planet.orbit);
  const mOrbit = staticOrbit(params.moon?.orbitAroundPlanet);

  return [
    ...validateSystemParamsPhysics(params),
    ...collectPlanetWarnings(params, pOrbit),
    ...collectMoonWarnings(params, mOrbit),
    ...collectPhotometryDisplayWarnings(params),
    ...collectPhotometryModelWarnings(params),
  ];
}

const staticOrbit = (orbit: unknown): OrbitElements | undefined => {
  return orbit && typeof orbit !== "function" ? (orbit as OrbitElements) : undefined;
};

const finiteNumber = (value: unknown): value is number => {
  return typeof value === "number" && Number.isFinite(value);
};

const positiveNumber = (value: unknown): value is number => {
  return finiteNumber(value) && value > 0;
};

const hasFiniteOrbitShape = (orbit: OrbitElements | undefined): orbit is OrbitElements => {
  return Boolean(orbit) && finiteNumber(orbit?.a) && finiteNumber(orbit?.e);
};

const highEccentricityWarning = (
  eccentricity: number,
  code: "HIGH_ECC_PLANET" | "HIGH_ECC_MOON",
): UiValidationMessage[] => {
  if (eccentricity < 0.95 || eccentricity >= 1) return [];

  const noun = code === "HIGH_ECC_PLANET" ? "planetary" : "moon";
  const suffix =
    code === "HIGH_ECC_PLANET"
      ? "Periastron handling may be numerically stiff."
      : "Pericenter may become non-physical.";

  return [
    {
      severity: "warn",
      code,
      message: `High ${noun} eccentricity (e=${eccentricity.toFixed(3)}). ${suffix}`,
    },
  ];
};

const collectPlanetWarnings = (
  params: BrowserScenarioDraft,
  pOrbit: OrbitElements | undefined,
): UiValidationMessage[] => {
  if (!hasFiniteOrbitShape(pOrbit)) return [];

  return [
    ...highEccentricityWarning(pOrbit.e, "HIGH_ECC_PLANET"),
    ...collectPlanetStarWarnings(params.planet, pOrbit, params.star?.r),
  ];
};

const collectPlanetStarWarnings = (
  planet: PlanetParams,
  pOrbit: OrbitElements,
  starR: number | undefined,
): UiValidationMessage[] => {
  if (!positiveNumber(starR)) return [];

  const out: UiValidationMessage[] = [];
  const qP = pOrbit.a * (1 - pOrbit.e);

  if (Number.isFinite(qP) && qP <= starR) {
    out.push({
      severity: "warn",
      code: "PLANET_PERIA_INSIDE_STAR",
      message: "Planet periapsis is inside the stellar radius (collision/non-physical).",
    });
  }

  if (positiveNumber(planet.r) && planet.r >= starR) {
    out.push({
      severity: "warn",
      code: "PLANET_LARGER_THAN_STAR",
      message: "Planet radius is >= stellar radius; typically non-physical.",
    });
  }

  return out;
};

const collectMoonWarnings = (
  params: BrowserScenarioDraft,
  mOrbit: OrbitElements | undefined,
): UiValidationMessage[] => {
  if (!params.moon || !hasFiniteOrbitShape(mOrbit)) return [];

  return [
    ...highEccentricityWarning(mOrbit.e, "HIGH_ECC_MOON"),
    ...collectMoonPlanetWarnings(params.planet, params.moon, mOrbit),
    ...collectMoonRocheWarnings(params.planet, params.moon, mOrbit),
  ];
};

const collectMoonPlanetWarnings = (
  planet: PlanetParams,
  moon: MoonParams,
  mOrbit: OrbitElements,
): UiValidationMessage[] => {
  const out: UiValidationMessage[] = [];

  if (positiveNumber(planet.r)) {
    const qM = mOrbit.a * (1 - mOrbit.e);
    if (Number.isFinite(qM) && qM <= planet.r) {
      out.push({
        severity: "warn",
        code: "MOON_PERIA_INSIDE_PLANET",
        message: "Moon pericenter is inside the planet radius (collision/non-physical).",
      });
    }
  }

  if (finiteNumber(moon.r) && finiteNumber(planet.r) && moon.r >= planet.r) {
    out.push({
      severity: "warn",
      code: "MOON_LARGER_THAN_PLANET",
      message: "Moon radius is >= planet radius; typically non-physical.",
    });
  }

  return out;
};

const collectMoonRocheWarnings = (
  planet: PlanetParams,
  moon: MoonParams,
  mOrbit: OrbitElements,
): UiValidationMessage[] => {
  const roche = rocheLimit(planet, moon);
  const qM = mOrbit.a * (1 - mOrbit.e);

  if (!Number.isFinite(qM) || !Number.isFinite(roche) || qM >= roche) return [];

  return [
    {
      severity: "warn",
      code: "MOON_ROCHE_LIMIT",
      message: "Moon pericenter is inside the Roche limit (fluid satellite approximation).",
      details: { qM, roche },
    },
  ];
};

const rocheLimit = (planet: PlanetParams, moon: MoonParams): number => {
  if (!positiveNumber(planet.r) || !positiveNumber(moon.r)) return Number.NaN;
  if (!positiveNumber(planet.m) || !positiveNumber(moon.m)) return Number.NaN;

  const rhoPlanet = (3 * planet.m) / (4 * Math.PI * Math.pow(planet.r, 3));
  const rhoMoon = (3 * moon.m) / (4 * Math.PI * Math.pow(moon.r, 3));

  if (!positiveNumber(rhoPlanet) || !positiveNumber(rhoMoon)) return Number.NaN;

  // Fluid Roche limit (approx): 2.44 * Rp * (rho_p / rho_m)^(1/3)
  return 2.44 * planet.r * Math.cbrt(rhoPlanet / rhoMoon);
};

const collectPhotometryDisplayWarnings = (params: BrowserScenarioDraft): UiValidationMessage[] => {
  const phot = params.star?.photometry;

  return [...lowGridResWarnings(phot?.gridRes), ...spotEvolutionWarnings(phot)];
};

const lowGridResWarnings = (gridRes: unknown): UiValidationMessage[] => {
  if (!positiveNumber(gridRes) || gridRes >= 40) return [];

  return [
    {
      severity: "info",
      code: "LOW_GRID_RES",
      message: "gridRes is very low; transit accuracy may degrade.",
    },
  ];
};

const spotEvolutionWarnings = (phot: PhotometryConfig): UiValidationMessage[] => {
  if (!phot?.spotEvolution?.enabled) return [];
  if (Array.isArray(phot.brightnessPatches) && phot.brightnessPatches.length > 0) return [];

  return [
    {
      severity: "info",
      code: "SPOT_EVOLUTION_NO_PATCHES",
      message: "Spot evolution is enabled, but no brightness patches are configured.",
    },
  ];
};

const collectPhotometryModelWarnings = (params: BrowserScenarioDraft): UiValidationMessage[] => {
  const phot = params.star?.photometry;

  return [...atmosphereTransmissionWarnings(phot), ...smearingWarnings(phot)];
};

const atmosphereTransmissionWarnings = (phot: PhotometryConfig): UiValidationMessage[] => {
  const atm = phot?.atmosphereTransmission;
  if (!atm?.enabled) return [];

  const lambdaNm = Array.isArray(atm.lambdaNm) ? atm.lambdaNm : [];
  const tauScale = Array.isArray(atm.tauScale) ? atm.tauScale : [];
  if (lambdaNm.length === 0 || tauScale.length <= 1 || tauScale.length === lambdaNm.length) return [];

  return [
    {
      severity: "info",
      code: "ATM_LAMBDA_TAUSCALE_MISMATCH",
      message: "lambdaNm and tauScale have different lengths; tauScale defaults to 1.0.",
    },
  ];
};

const smearingWarnings = (phot: PhotometryConfig): UiValidationMessage[] => {
  const cadenceSec = phot?.cadenceSec;
  const nSub = phot?.nSubsamples;

  if (!positiveNumber(cadenceSec) || !finiteNumber(nSub) || nSub > 1) return [];

  return [
    {
      severity: "info",
      code: "SMEARING_DISABLED",
      message: "cadenceSec > 0 but nSubsamples <= 1; smearing is effectively disabled.",
    },
  ];
};
