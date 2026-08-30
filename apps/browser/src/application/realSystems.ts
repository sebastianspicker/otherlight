/**
 * Owns real Systems support within the app layer. Keeps application bootstrap and frame orchestration composable.
 */
import type { OrbitElements, BrowserScenarioDraft } from "../domain/model/types";
import {
  AU_M,
  DAY_S,
  DEG2RAD,
  EARTH_MASS_KG,
  EARTH_RADIUS_M,
  JUPITER_MASS_KG,
  JUPITER_RADIUS_M,
  SOLAR_MASS_KG,
  SOLAR_RADIUS_M,
} from "../domain/model/units";
import { cloneParams, SCENARIO_DEFAULTS } from "./scenario";
import snapshotJson from "./catalog/real-systems.snapshot.json";

export type RealSystemsSnapshotMeta = {
  source: string;
  fetchedAt: string;
  rowCount: number;
  selectionPolicy: string;
};

export type RealSystemSnapshotEntry = {
  id: string;
  label: string;
  hostname: string;
  discYear?: number;
  starRadiusSolar: number;
  starMassSolar?: number;
  planetRadiusJupiter?: number;
  planetRadiusEarth?: number;
  planetMassJupiter?: number;
  planetMassEarth?: number;
  semiMajorAxisAu: number;
  periodDays: number;
  eccentricity?: number;
  inclinationDeg?: number;
};

export type RealSystemsSnapshot = {
  meta: RealSystemsSnapshotMeta;
  systems: RealSystemSnapshotEntry[];
};

export type RealSystemOption = {
  id: string;
  label: string;
};

type RealSystemRequiredFields = Pick<
  RealSystemSnapshotEntry,
  | "id"
  | "label"
  | "hostname"
  | "starRadiusSolar"
  | "semiMajorAxisAu"
  | "periodDays"
  | "planetRadiusJupiter"
  | "planetRadiusEarth"
>;

type RealSystemScalars = {
  starRadiusM: number;
  orbitA: number;
  orbitPeriod: number;
  bodyRadius: number;
};

const FALLBACK_SNAPSHOT: RealSystemsSnapshot = {
  meta: {
    source: "NASA Exoplanet Archive (snapshot unavailable)",
    fetchedAt: "",
    rowCount: 0,
    selectionPolicy: "none",
  },
  systems: [],
};

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null;
}

function finitePos(v: unknown): number | undefined {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function finite(v: unknown): number | undefined {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function asString(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function stringWithFallback(v: unknown, fallback: string): string {
  return asString(v) ?? fallback;
}

function normalizedRowCount(v: unknown): number {
  return Math.max(0, Math.floor(finite(v) ?? 0));
}

function normalizeMeta(raw: unknown): RealSystemsSnapshotMeta {
  if (!isObject(raw)) return FALLBACK_SNAPSHOT.meta;

  return {
    source: stringWithFallback(raw.source, FALLBACK_SNAPSHOT.meta.source),
    fetchedAt: stringWithFallback(raw.fetchedAt, ""),
    rowCount: normalizedRowCount(raw.rowCount),
    selectionPolicy: stringWithFallback(raw.selectionPolicy, FALLBACK_SNAPSHOT.meta.selectionPolicy),
  };
}

function normalizeEntry(raw: unknown): RealSystemSnapshotEntry | null {
  if (!isObject(raw)) return null;

  const required = normalizeRequiredEntryFields(raw);
  if (!required) return null;

  return {
    ...required,
    ...normalizeOptionalEntryFields(raw),
  };
}

function normalizeRequiredEntryFields(raw: Record<string, unknown>): RealSystemRequiredFields | null {
  const textFields = normalizeEntryTextFields(raw);
  const orbitFields = normalizeEntryOrbitFields(raw);
  const radiusFields = normalizeEntryPlanetRadiusFields(raw);

  if (!textFields || !orbitFields || !radiusFields) return null;

  return {
    ...textFields,
    ...orbitFields,
    ...radiusFields,
  };
}

function normalizeEntryTextFields(
  raw: Record<string, unknown>,
): Pick<RealSystemRequiredFields, "id" | "label" | "hostname"> | null {
  const id = asString(raw.id);
  const label = asString(raw.label);
  const hostname = asString(raw.hostname);

  if (!id || !label || !hostname) return null;
  return { id, label, hostname };
}

function normalizeEntryOrbitFields(
  raw: Record<string, unknown>,
): Pick<RealSystemRequiredFields, "starRadiusSolar" | "semiMajorAxisAu" | "periodDays"> | null {
  const starRadiusSolar = finitePos(raw.starRadiusSolar);
  const semiMajorAxisAu = finitePos(raw.semiMajorAxisAu);
  const periodDays = finitePos(raw.periodDays);

  if (!starRadiusSolar || !semiMajorAxisAu || !periodDays) return null;
  return { starRadiusSolar, semiMajorAxisAu, periodDays };
}

function normalizeEntryPlanetRadiusFields(
  raw: Record<string, unknown>,
): Pick<RealSystemRequiredFields, "planetRadiusJupiter" | "planetRadiusEarth"> | null {
  const planetRadiusJupiter = finitePos(raw.planetRadiusJupiter);
  const planetRadiusEarth = finitePos(raw.planetRadiusEarth);

  if (!planetRadiusJupiter && !planetRadiusEarth) return null;
  return { planetRadiusJupiter, planetRadiusEarth };
}

function normalizeOptionalEntryFields(raw: Record<string, unknown>): Partial<RealSystemSnapshotEntry> {
  const discYear = finite(raw.discYear);
  const eccentricity = finite(raw.eccentricity);
  const inclinationDeg = finite(raw.inclinationDeg);

  return {
    discYear: typeof discYear === "number" ? Math.floor(discYear) : undefined,
    starMassSolar: finitePos(raw.starMassSolar),
    planetMassJupiter: finitePos(raw.planetMassJupiter),
    planetMassEarth: finitePos(raw.planetMassEarth),
    eccentricity,
    inclinationDeg,
  };
}

function normalizeSnapshot(raw: unknown): RealSystemsSnapshot {
  if (!isObject(raw)) return FALLBACK_SNAPSHOT;

  const meta = normalizeMeta(raw.meta);
  const systemsRaw = Array.isArray(raw.systems) ? raw.systems : [];

  const systems: RealSystemSnapshotEntry[] = [];
  for (const entryRaw of systemsRaw) {
    const entry = normalizeEntry(entryRaw);
    if (entry) systems.push(entry);
  }

  return {
    meta: {
      ...meta,
      rowCount: systems.length,
    },
    systems,
  };
}

const REAL_SYSTEMS_SNAPSHOT: RealSystemsSnapshot = normalizeSnapshot(snapshotJson);

export const REAL_SYSTEMS_OPTIONS: RealSystemOption[] = REAL_SYSTEMS_SNAPSHOT.systems.map((s) => ({
  id: s.id,
  label: s.label,
}));

function planetRadiusMeters(entry: RealSystemSnapshotEntry): number {
  if (typeof entry.planetRadiusJupiter === "number") return entry.planetRadiusJupiter * JUPITER_RADIUS_M;
  if (typeof entry.planetRadiusEarth === "number") return entry.planetRadiusEarth * EARTH_RADIUS_M;
  throw new Error(`Real system ${entry.id} has no valid planet radius.`);
}

function planetMassKg(entry: RealSystemSnapshotEntry): number | undefined {
  if (typeof entry.planetMassJupiter === "number") return entry.planetMassJupiter * JUPITER_MASS_KG;
  if (typeof entry.planetMassEarth === "number") return entry.planetMassEarth * EARTH_MASS_KG;
  return undefined;
}

export function getRealSystemById(id: string): RealSystemSnapshotEntry | undefined {
  return REAL_SYSTEMS_SNAPSHOT.systems.find((s) => s.id === id);
}

export function mapSnapshotSystemToParams(entry: RealSystemSnapshotEntry): BrowserScenarioDraft {
  const base = cloneParams(SCENARIO_DEFAULTS);
  const scalars = realSystemScalars(entry);
  validateRealSystemScalars(entry, scalars);

  applyRealSystemStar(base, entry, scalars.starRadiusM);
  applyRealSystemPlanet(base, entry, scalars.bodyRadius);

  base.planet.orbit = {
    ...staticPlanetOrbit(base),
    a: scalars.orbitA,
    period: scalars.orbitPeriod,
    e: normalizedEccentricity(entry),
    inc: normalizedInclinationRad(entry),
    Omega: 0,
    omega: 0,
    t0: 0,
  };

  delete base.moon;
  return base;
}

function realSystemScalars(entry: RealSystemSnapshotEntry): RealSystemScalars {
  return {
    starRadiusM: entry.starRadiusSolar * SOLAR_RADIUS_M,
    orbitA: entry.semiMajorAxisAu * AU_M,
    orbitPeriod: entry.periodDays * DAY_S,
    bodyRadius: planetRadiusMeters(entry),
  };
}

function validateRealSystemScalars(entry: RealSystemSnapshotEntry, scalars: RealSystemScalars): void {
  assertPositiveRealSystemScalar(entry, scalars.starRadiusM, "stellar radius");
  assertPositiveRealSystemScalar(entry, scalars.orbitA, "orbit parameters");
  assertPositiveRealSystemScalar(entry, scalars.orbitPeriod, "orbit parameters");
  assertPositiveRealSystemScalar(entry, scalars.bodyRadius, "planet radius");
}

function assertPositiveRealSystemScalar(entry: RealSystemSnapshotEntry, value: number, label: string): void {
  if (Number.isFinite(value) && value > 0) return;
  throw new Error(`Real system ${entry.id} has invalid ${label}.`);
}

function normalizedEccentricity(entry: RealSystemSnapshotEntry): number {
  const raw = typeof entry.eccentricity === "number" ? entry.eccentricity : 0;
  return Number.isFinite(raw) ? Math.min(0.999, Math.max(0, raw)) : 0;
}

function normalizedInclinationRad(entry: RealSystemSnapshotEntry): number {
  const rawDeg = typeof entry.inclinationDeg === "number" ? entry.inclinationDeg : 90;
  return Number.isFinite(rawDeg) ? Math.min(Math.PI, Math.max(0, rawDeg * DEG2RAD)) : 90 * DEG2RAD;
}

function applyRealSystemStar(
  base: BrowserScenarioDraft,
  entry: RealSystemSnapshotEntry,
  starRadiusM: number,
): void {
  base.star.r = starRadiusM;
  if (typeof entry.starMassSolar === "number") {
    base.star.m = entry.starMassSolar * SOLAR_MASS_KG;
  } else {
    delete base.star.m;
  }
}

function applyRealSystemPlanet(
  base: BrowserScenarioDraft,
  entry: RealSystemSnapshotEntry,
  bodyRadius: number,
): void {
  base.planet.r = bodyRadius;

  const massKg = planetMassKg(entry);
  if (typeof massKg === "number" && Number.isFinite(massKg) && massKg > 0) {
    base.planet.m = massKg;
  } else {
    delete base.planet.m;
  }
}

function staticPlanetOrbit(base: BrowserScenarioDraft): OrbitElements {
  if (typeof base.planet.orbit === "function") {
    throw new Error("Expected static orbit elements in scenario defaults.");
  }
  return base.planet.orbit;
}

export function buildParamsFromRealSystem(id: string): BrowserScenarioDraft {
  const entry = getRealSystemById(id);
  if (!entry) {
    throw new Error(`Unknown real system id: ${id}`);
  }
  return mapSnapshotSystemToParams(entry);
}

export function formatRealSystemMeta(entry: RealSystemSnapshotEntry): string {
  const parts: string[] = [];

  parts.push(`Source: ${REAL_SYSTEMS_SNAPSHOT.meta.source}`);
  parts.push(`Host: ${entry.hostname}`);

  if (typeof entry.discYear === "number" && entry.discYear > 0) {
    parts.push(`Discovery: ${entry.discYear}`);
  }

  if (REAL_SYSTEMS_SNAPSHOT.meta.fetchedAt) {
    const d = new Date(REAL_SYSTEMS_SNAPSHOT.meta.fetchedAt);
    if (!Number.isNaN(d.getTime())) {
      parts.push(`Snapshot: ${d.toISOString().slice(0, 10)}`);
    }
  }

  return parts.join(" | ");
}
