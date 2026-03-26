#!/usr/bin/env node
/* global fetch, process */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const DEFAULT_LIMIT = 20;

export const NASA_TAP_QUERY = [
  "select",
  "pl_name,hostname,disc_year,st_rad,st_mass,pl_radj,pl_rade,pl_bmassj,pl_bmasse,",
  "pl_orbsmax,pl_orbper,pl_orbeccen,pl_orbincl,tran_flag",
  "from pscomppars",
  "where tran_flag = 1",
].join(" ");

export const NASA_TAP_URL = `https://exoplanetarchive.ipac.caltech.edu/TAP/sync?query=${encodeURIComponent(NASA_TAP_QUERY)}&format=json`;

function toFinite(v) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function toPositive(v) {
  const n = toFinite(v);
  return typeof n === "number" && n > 0 ? n : undefined;
}

function slugifyName(label) {
  return String(label)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function normalizeNasaRow(row) {
  if (!row || typeof row !== "object") return null;

  const transit = toFinite(row.tran_flag);
  if (transit !== 1) return null;

  const label = typeof row.pl_name === "string" ? row.pl_name.trim() : "";
  const hostname = typeof row.hostname === "string" ? row.hostname.trim() : "";
  if (!label || !hostname) return null;

  const starRadiusSolar = toPositive(row.st_rad);
  const semiMajorAxisAu = toPositive(row.pl_orbsmax);
  const periodDays = toPositive(row.pl_orbper);
  const planetRadiusJupiter = toPositive(row.pl_radj);
  const planetRadiusEarth = toPositive(row.pl_rade);

  if (!starRadiusSolar || !semiMajorAxisAu || !periodDays) return null;
  if (!planetRadiusJupiter && !planetRadiusEarth) return null;

  const entry = {
    id: slugifyName(label),
    label,
    hostname,
    discYear: toFinite(row.disc_year),
    starRadiusSolar,
    starMassSolar: toPositive(row.st_mass),
    planetRadiusJupiter,
    planetRadiusEarth,
    planetMassJupiter: toPositive(row.pl_bmassj),
    planetMassEarth: toPositive(row.pl_bmasse),
    semiMajorAxisAu,
    periodDays,
    eccentricity: toFinite(row.pl_orbeccen),
    inclinationDeg: toFinite(row.pl_orbincl),
  };

  if (!entry.id) return null;
  return entry;
}

export function scoreSnapshotEntry(entry) {
  if (!entry) return Number.NEGATIVE_INFINITY;

  let score = 0;
  score += 20; // required fields are already present

  if (typeof entry.starMassSolar === "number") score += 4;
  if (typeof entry.planetMassJupiter === "number" || typeof entry.planetMassEarth === "number") score += 4;
  if (typeof entry.eccentricity === "number") score += 2;
  if (typeof entry.inclinationDeg === "number") score += 2;
  if (typeof entry.discYear === "number") score += 1;

  // Very small bias toward clearer labels as deterministic tie-break support.
  score += Math.max(0, 0.001 * (50 - Math.min(String(entry.label).length, 50)));

  return score;
}

export function selectTopSystems(rows, limit = DEFAULT_LIMIT) {
  const max = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : DEFAULT_LIMIT;

  const byId = new Map();

  for (const row of rows) {
    const norm = normalizeNasaRow(row);
    if (!norm) continue;

    const prev = byId.get(norm.id);
    if (!prev) {
      byId.set(norm.id, norm);
      continue;
    }

    const prevScore = scoreSnapshotEntry(prev);
    const nextScore = scoreSnapshotEntry(norm);
    if (nextScore > prevScore) {
      byId.set(norm.id, norm);
      continue;
    }

    if (nextScore === prevScore && String(norm.label).localeCompare(String(prev.label)) < 0) {
      byId.set(norm.id, norm);
    }
  }

  return [...byId.values()]
    .sort((a, b) => {
      const ds = scoreSnapshotEntry(b) - scoreSnapshotEntry(a);
      if (ds !== 0) return ds;
      return String(a.label).localeCompare(String(b.label));
    })
    .slice(0, max);
}

export function buildSnapshotFromRows(rows, opts = {}) {
  const fetchedAt = typeof opts.fetchedAt === "string" ? opts.fetchedAt : new Date().toISOString();
  const limit = Number.isFinite(opts.limit) ? opts.limit : DEFAULT_LIMIT;
  const systems = selectTopSystems(rows, limit);

  return {
    meta: {
      source: "NASA Exoplanet Archive (pscomppars via TAP)",
      fetchedAt,
      rowCount: systems.length,
      selectionPolicy: `transit-only, required-fields, score-ranked top ${Math.max(1, Math.floor(limit || DEFAULT_LIMIT))}`,
    },
    systems,
  };
}

export async function fetchNasaTransitRows(fetchImpl = fetch) {
  const response = await fetchImpl(NASA_TAP_URL, {
    headers: {
      accept: "application/json",
      "user-agent": "exoplanet-exomoon-simulation/real-systems-refresh",
    },
  });

  if (!response.ok) {
    throw new Error(`NASA TAP request failed (${response.status} ${response.statusText})`);
  }

  const json = await response.json();
  if (!Array.isArray(json)) {
    throw new Error("NASA TAP response is not an array.");
  }

  return json;
}

export async function writeSnapshotFile(snapshot, outPath) {
  const text = `${JSON.stringify(snapshot, null, 2)}\n`;
  await fs.writeFile(outPath, text, "utf8");
}

async function main() {
  const rows = await fetchNasaTransitRows();
  const snapshot = buildSnapshotFromRows(rows, { limit: DEFAULT_LIMIT });

  if (!snapshot.systems.length) {
    throw new Error("No valid transit systems found; refusing to overwrite snapshot with empty data.");
  }

  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const outPath = path.resolve(scriptDir, "../src/config/real-systems.snapshot.json");
  await writeSnapshotFile(snapshot, outPath);

  process.stdout.write(
    `Wrote ${snapshot.systems.length} real systems to ${outPath} (fetchedAt=${snapshot.meta.fetchedAt}).\n`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`refresh failed: ${msg}\n`);
    process.exit(1);
  });
}
