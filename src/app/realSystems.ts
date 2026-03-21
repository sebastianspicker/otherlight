import type { SystemParams } from "../core/types";
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
} from "../core/units";
import { cloneParams, SCENARIO_DEFAULTS } from "./scenario";
import snapshotJson from "../config/real-systems.snapshot.json";

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

function normalizeMeta(raw: unknown): RealSystemsSnapshotMeta {
  if (!isObject(raw)) return FALLBACK_SNAPSHOT.meta;

  return {
    source: asString(raw.source) ?? FALLBACK_SNAPSHOT.meta.source,
    fetchedAt: asString(raw.fetchedAt) ?? "",
    rowCount: Math.max(0, Math.floor(finite(raw.rowCount) ?? 0)),
    selectionPolicy: asString(raw.selectionPolicy) ?? FALLBACK_SNAPSHOT.meta.selectionPolicy,
  };
}

function normalizeEntry(raw: unknown): RealSystemSnapshotEntry | null {
  if (!isObject(raw)) return null;

  const id = asString(raw.id);
  const label = asString(raw.label);
  const hostname = asString(raw.hostname);

  const starRadiusSolar = finitePos(raw.starRadiusSolar);
  const semiMajorAxisAu = finitePos(raw.semiMajorAxisAu);
  const periodDays = finitePos(raw.periodDays);

  const planetRadiusJupiter = finitePos(raw.planetRadiusJupiter);
  const planetRadiusEarth = finitePos(raw.planetRadiusEarth);

  if (!id || !label || !hostname) return null;
  if (!starRadiusSolar || !semiMajorAxisAu || !periodDays) return null;
  if (!planetRadiusJupiter && !planetRadiusEarth) return null;

  const discYear = finite(raw.discYear);
  const eccentricity = finite(raw.eccentricity);
  const inclinationDeg = finite(raw.inclinationDeg);

  return {
    id,
    label,
    hostname,
    discYear: typeof discYear === "number" ? Math.floor(discYear) : undefined,
    starRadiusSolar,
    starMassSolar: finitePos(raw.starMassSolar),
    planetRadiusJupiter,
    planetRadiusEarth,
    planetMassJupiter: finitePos(raw.planetMassJupiter),
    planetMassEarth: finitePos(raw.planetMassEarth),
    semiMajorAxisAu,
    periodDays,
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

export const REAL_SYSTEMS_SNAPSHOT: RealSystemsSnapshot = normalizeSnapshot(snapshotJson);

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

export function mapSnapshotSystemToParams(entry: RealSystemSnapshotEntry): SystemParams {
  const base = cloneParams(SCENARIO_DEFAULTS);

  const starRadiusM = entry.starRadiusSolar * SOLAR_RADIUS_M;
  const orbitA = entry.semiMajorAxisAu * AU_M;
  const orbitPeriod = entry.periodDays * DAY_S;
  const bodyRadius = planetRadiusMeters(entry);

  if (!Number.isFinite(starRadiusM) || starRadiusM <= 0) {
    throw new Error(`Real system ${entry.id} has invalid stellar radius.`);
  }
  if (!Number.isFinite(orbitA) || orbitA <= 0 || !Number.isFinite(orbitPeriod) || orbitPeriod <= 0) {
    throw new Error(`Real system ${entry.id} has invalid orbit parameters.`);
  }
  if (!Number.isFinite(bodyRadius) || bodyRadius <= 0) {
    throw new Error(`Real system ${entry.id} has invalid planet radius.`);
  }

  const eRaw = typeof entry.eccentricity === "number" ? entry.eccentricity : 0;
  const e = Number.isFinite(eRaw) ? Math.min(0.999, Math.max(0, eRaw)) : 0;

  const incDeg = typeof entry.inclinationDeg === "number" ? entry.inclinationDeg : 90;
  const inc = Number.isFinite(incDeg) ? Math.min(Math.PI, Math.max(0, incDeg * DEG2RAD)) : 90 * DEG2RAD;

  base.star.r = starRadiusM;
  if (typeof entry.starMassSolar === "number") {
    base.star.m = entry.starMassSolar * SOLAR_MASS_KG;
  } else {
    delete base.star.m;
  }

  base.planet.r = bodyRadius;

  const pm = planetMassKg(entry);
  if (typeof pm === "number" && Number.isFinite(pm) && pm > 0) {
    base.planet.m = pm;
  } else {
    delete base.planet.m;
  }

  if (typeof base.planet.orbit === "function") {
    throw new Error("Expected static orbit elements in scenario defaults.");
  }

  base.planet.orbit = {
    ...base.planet.orbit,
    a: orbitA,
    period: orbitPeriod,
    e,
    inc,
    Omega: 0,
    omega: 0,
    t0: 0,
  };

  delete base.moon;
  return base;
}

export function buildParamsFromRealSystem(id: string): SystemParams {
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
