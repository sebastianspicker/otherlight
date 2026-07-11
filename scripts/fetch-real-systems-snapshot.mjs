#!/usr/bin/env node
/* global AbortController, TextDecoder, TextEncoder, clearTimeout, fetch, process, setTimeout */

import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_LIMIT = 20;
const DEFAULT_FETCH_TIMEOUT_MS = 15_000;
const MAX_NASA_RESPONSE_BYTES = 10 * 1024 * 1024;
const SNAPSHOT_OUTPUT_PATH = "src/config/real-systems.snapshot.json";

export const NASA_TAP_QUERY = [
  "select",
  "pl_name,hostname,disc_year,st_rad,st_mass,pl_radj,pl_rade,pl_bmassj,pl_bmasse,",
  "pl_orbsmax,pl_orbper,pl_orbeccen,pl_orbincl,tran_flag",
  "from pscomppars",
  "where tran_flag = 1",
].join(" ");

export const NASA_TAP_URL = `https://exoplanetarchive.ipac.caltech.edu/TAP/sync?query=${encodeURIComponent(NASA_TAP_QUERY)}&format=json`;

function createTimeoutSignal(timeoutMs) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return {
      signal: undefined,
      timedOut: () => false,
      cancel: () => undefined,
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  return {
    signal: controller.signal,
    timedOut: () => controller.signal.aborted,
    cancel: () => clearTimeout(timeout),
  };
}

function abortError(signal) {
  if (signal?.reason instanceof Error) return signal.reason;
  return new Error("NASA TAP request aborted.");
}

function raceAbort(promise, signal) {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(abortError(signal));

  return new Promise((resolve, reject) => {
    const onAbort = () => reject(abortError(signal));
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort));
  });
}

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
  if (!isTransitObject(row)) return null;
  const identity = rowIdentity(row);
  const physical = requiredPhysicalFields(row);
  if (!identity || !physical) return null;
  const entry = {
    ...identity,
    ...physical,
    discYear: toFinite(row.disc_year),
    starMassSolar: toPositive(row.st_mass),
    planetMassJupiter: toPositive(row.pl_bmassj),
    planetMassEarth: toPositive(row.pl_bmasse),
    eccentricity: toFinite(row.pl_orbeccen),
    inclinationDeg: toFinite(row.pl_orbincl),
  };
  if (!entry.id) return null;
  return entry;
}

function isTransitObject(row) {
  return Boolean(row && typeof row === "object" && toFinite(row.tran_flag) === 1);
}

function rowIdentity(row) {
  const label = trimmedString(row.pl_name);
  const hostname = trimmedString(row.hostname);
  if (!label || !hostname) return null;
  return {
    id: slugifyName(label),
    label,
    hostname,
  };
}

function trimmedString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function requiredPhysicalFields(row) {
  const orbital = requiredOrbitFields(row);
  const radius = requiredPlanetRadiusFields(row);
  if (!orbital || !radius) return null;
  return {
    ...orbital,
    ...radius,
  };
}

function requiredOrbitFields(row) {
  const starRadiusSolar = toPositive(row.st_rad);
  const semiMajorAxisAu = toPositive(row.pl_orbsmax);
  const periodDays = toPositive(row.pl_orbper);
  if (!starRadiusSolar || !semiMajorAxisAu || !periodDays) return null;
  return { starRadiusSolar, semiMajorAxisAu, periodDays };
}

function requiredPlanetRadiusFields(row) {
  const planetRadiusJupiter = toPositive(row.pl_radj);
  const planetRadiusEarth = toPositive(row.pl_rade);
  if (!planetRadiusJupiter && !planetRadiusEarth) return null;
  return { planetRadiusJupiter, planetRadiusEarth };
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
    if (norm) keepBestEntry(byId, norm);
  }
  return [...byId.values()].sort(compareSnapshotEntries).slice(0, max);
}

function keepBestEntry(byId, entry) {
  const prev = byId.get(entry.id);
  if (!prev || isPreferredSnapshotEntry(entry, prev)) {
    byId.set(entry.id, entry);
  }
}

function isPreferredSnapshotEntry(next, prev) {
  const prevScore = scoreSnapshotEntry(prev);
  const nextScore = scoreSnapshotEntry(next);
  if (nextScore !== prevScore) return nextScore > prevScore;
  return String(next.label).localeCompare(String(prev.label)) < 0;
}

function compareSnapshotEntries(a, b) {
  const ds = scoreSnapshotEntry(b) - scoreSnapshotEntry(a);
  if (ds !== 0) return ds;
  return String(a.label).localeCompare(String(b.label));
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

async function readResponseTextWithinLimit(response, maxBytes, signal) {
  const limit = Number.isFinite(maxBytes) && maxBytes > 0 ? Math.floor(maxBytes) : MAX_NASA_RESPONSE_BYTES;
  const contentLength = response.headers?.get?.("content-length");
  if (contentLength) {
    const advertisedBytes = Number(contentLength);
    if (Number.isFinite(advertisedBytes) && advertisedBytes > limit) {
      throw new Error(`NASA TAP response exceeds ${limit} bytes.`);
    }
  }

  if (!response.body?.getReader) {
    const text = await raceAbort(response.text(), signal);
    const bytes = new TextEncoder().encode(text).byteLength;
    if (bytes > limit) throw new Error(`NASA TAP response exceeds ${limit} bytes.`);
    return text;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";

  try {
    while (true) {
      const { done, value } = await raceAbort(reader.read(), signal);
      if (done) break;
      bytes += value.byteLength;
      if (bytes > limit) {
        await reader.cancel().catch(() => undefined);
        throw new Error(`NASA TAP response exceeds ${limit} bytes.`);
      }
      text += decoder.decode(value, { stream: true });
    }
  } catch (error) {
    if (signal?.aborted) await reader.cancel().catch(() => undefined);
    throw error;
  }

  text += decoder.decode();
  return text;
}

export async function fetchNasaTransitRows(fetchImpl = fetch, opts = {}) {
  const timeoutMs = Number.isFinite(opts.timeoutMs) ? opts.timeoutMs : DEFAULT_FETCH_TIMEOUT_MS;
  const maxBytes = Number.isFinite(opts.maxBytes) ? opts.maxBytes : MAX_NASA_RESPONSE_BYTES;
  const timeout = createTimeoutSignal(timeoutMs);
  let response;

  try {
    response = await fetchImpl(NASA_TAP_URL, {
      signal: timeout.signal,
      headers: {
        accept: "application/json",
        "user-agent": "exoplanet-exomoon-simulation/real-systems-refresh",
      },
    });

    if (!response.ok) {
      throw new Error(`NASA TAP request failed (${response.status} ${response.statusText})`);
    }

    const text = await readResponseTextWithinLimit(response, maxBytes, timeout.signal);
    const json = JSON.parse(text);
    if (!Array.isArray(json)) {
      throw new Error("NASA TAP response is not an array.");
    }

    return json;
  } catch (err) {
    if (timeout.timedOut()) {
      throw new Error(`NASA TAP request timed out after ${timeoutMs} ms.`, { cause: err });
    }
    throw err;
  } finally {
    timeout.cancel();
  }
}

function defaultSnapshotOutputPath() {
  return path.resolve(process.cwd(), SNAPSHOT_OUTPUT_PATH);
}

export function snapshotOutputPath() {
  return defaultSnapshotOutputPath();
}

export async function writeSnapshotFile(snapshot) {
  const text = `${JSON.stringify(snapshot, null, 2)}\n`;
  await fs.writeFile("src/config/real-systems.snapshot.json", text, "utf8");
}

async function main() {
  const rows = await fetchNasaTransitRows();
  const snapshot = buildSnapshotFromRows(rows, { limit: DEFAULT_LIMIT });

  if (!snapshot.systems.length) {
    throw new Error("No valid transit systems found; refusing to overwrite snapshot with empty data.");
  }

  const outPath = defaultSnapshotOutputPath();
  await writeSnapshotFile(snapshot);

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
