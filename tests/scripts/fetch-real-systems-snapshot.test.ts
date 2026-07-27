/** Verifies fetch real systems snapshot behavior for reproducible data and migration workflows. */

import { expect, it } from "vitest";

const scriptMod = await import(
  new URL("../../scripts/fetch-real-systems-snapshot.mjs", import.meta.url).href
);

const {
  normalizeNasaRow,
  selectTopSystems,
  buildSnapshotFromRows,
  scoreSnapshotEntry,
  fetchNasaTransitRows,
  snapshotOutputPath,
}: {
  normalizeNasaRow: (row: Record<string, unknown>) => SnapshotEntry | null;
  selectTopSystems: (rows: Record<string, unknown>[], limit?: number) => SnapshotEntry[];
  buildSnapshotFromRows: (
    rows: Record<string, unknown>[],
    opts?: { fetchedAt?: string; limit?: number },
  ) => Snapshot;
  scoreSnapshotEntry: (entry: SnapshotEntry | null) => number;
  fetchNasaTransitRows: (fetchImpl?: FetchLike, opts?: FetchOptions) => Promise<unknown[]>;
  snapshotOutputPath: () => string;
} = scriptMod as unknown as ScriptExports;

type SnapshotEntry = {
  id: string;
  label: string;
  semiMajorAxisAu?: number;
};

type Snapshot = {
  meta: {
    fetchedAt: string;
    rowCount: number;
  };
  systems: SnapshotEntry[];
};

type FetchOptions = {
  timeoutMs?: number;
  maxBytes?: number;
};

type FetchLike = (
  url: string,
  init: {
    signal?: AbortSignal;
    headers?: Record<string, string>;
  },
) => Promise<Response>;

type ScriptExports = {
  normalizeNasaRow: (row: Record<string, unknown>) => SnapshotEntry | null;
  selectTopSystems: (rows: Record<string, unknown>[], limit?: number) => SnapshotEntry[];
  buildSnapshotFromRows: (
    rows: Record<string, unknown>[],
    opts?: { fetchedAt?: string; limit?: number },
  ) => Snapshot;
  scoreSnapshotEntry: (entry: SnapshotEntry | null) => number;
  fetchNasaTransitRows: (fetchImpl?: FetchLike, opts?: FetchOptions) => Promise<unknown[]>;
  snapshotOutputPath: () => string;
};

it("normalizes a NASA row and computes a finite score", () => {
  const row = {
    pl_name: "Test-10 b",
    hostname: "Test-10",
    disc_year: 2022,
    st_rad: 1.02,
    st_mass: 1.01,
    pl_radj: 1.1,
    pl_bmassj: 0.7,
    pl_orbsmax: 0.05,
    pl_orbper: 3.4,
    pl_orbeccen: 0.03,
    pl_orbincl: 88.2,
    tran_flag: 1,
  };

  const norm = normalizeNasaRow(row);
  expect(norm).toBeTruthy();
  if (!norm) throw new Error("expected NASA row to normalize");
  expect(norm.id).toBe("test-10-b");
  expect(norm.label).toBe("Test-10 b");
  expect(norm.semiMajorAxisAu).toBe(0.05);
  expect(Number.isFinite(scoreSnapshotEntry(norm))).toBe(true);
});

it("selects deterministic top systems and enforces limit", () => {
  const rows = [
    {
      pl_name: "A-1 b",
      hostname: "A-1",
      st_rad: 1,
      pl_radj: 1,
      pl_orbsmax: 0.1,
      pl_orbper: 4,
      tran_flag: 1,
    },
    {
      pl_name: "B-1 b",
      hostname: "B-1",
      st_rad: 1,
      st_mass: 1,
      pl_radj: 1,
      pl_bmassj: 1,
      pl_orbsmax: 0.1,
      pl_orbper: 4,
      pl_orbeccen: 0.1,
      pl_orbincl: 89,
      tran_flag: 1,
    },
    {
      pl_name: "C-1 b",
      hostname: "C-1",
      st_rad: 1,
      pl_radj: 1,
      pl_orbsmax: 0.1,
      pl_orbper: 4,
      tran_flag: 1,
    },
  ];

  const out = selectTopSystems(rows, 2);

  expect(out).toHaveLength(2);
  expect(out[0].id).toBe("b-1-b");
  expect(out[1].id).toBe("a-1-b");
});

it("builds snapshot meta and keeps only transit rows with required fields", () => {
  const rows = [
    {
      pl_name: "Keep-1 b",
      hostname: "Keep-1",
      st_rad: 1,
      pl_radj: 1,
      pl_orbsmax: 0.1,
      pl_orbper: 3,
      tran_flag: 1,
    },
    {
      pl_name: "Drop-1 b",
      hostname: "Drop-1",
      st_rad: 1,
      pl_radj: 1,
      pl_orbsmax: 0.1,
      pl_orbper: 3,
      tran_flag: 0,
    },
  ];

  const snapshot = buildSnapshotFromRows(rows, {
    fetchedAt: "2026-02-19T10:00:00.000Z",
    limit: 20,
  });

  expect(snapshot.meta.fetchedAt).toBe("2026-02-19T10:00:00.000Z");
  expect(snapshot.meta.rowCount).toBe(1);
  expect(snapshot.systems).toHaveLength(1);
  expect(snapshot.systems[0].id).toBe("keep-1-b");
});

it("fetches NASA rows with bounded response parsing", async () => {
  const rows = [
    {
      pl_name: "Keep-1 b",
      hostname: "Keep-1",
      st_rad: 1,
      pl_radj: 1,
      pl_orbsmax: 0.1,
      pl_orbper: 3,
      tran_flag: 1,
    },
  ];
  const fetchImpl: FetchLike = async (_url, init) => {
    expect(init.signal).toBeInstanceOf(AbortSignal);
    return new Response(JSON.stringify(rows), {
      headers: { "content-type": "application/json" },
    });
  };

  await expect(fetchNasaTransitRows(fetchImpl, { timeoutMs: 1000, maxBytes: 4096 })).resolves.toEqual(rows);
});

it("rejects NASA responses with oversized content-length before parsing", async () => {
  const fetchImpl: FetchLike = async () =>
    new Response("[]", {
      headers: { "content-length": "4096" },
    });

  await expect(fetchNasaTransitRows(fetchImpl, { timeoutMs: 1000, maxBytes: 128 })).rejects.toThrow(
    "NASA TAP response exceeds 128 bytes",
  );
});

it("rejects streamed NASA responses that exceed the parser limit", async () => {
  const fetchImpl: FetchLike = async () =>
    new Response(JSON.stringify([{ pl_name: "Too Large b", hostname: "Too Large" }]));

  await expect(fetchNasaTransitRows(fetchImpl, { timeoutMs: 1000, maxBytes: 8 })).rejects.toThrow(
    "NASA TAP response exceeds 8 bytes",
  );
});

it("times out while waiting for a stalled streamed response body", async () => {
  const fetchImpl: FetchLike = async () =>
    new Response(
      new ReadableStream({
        start() {
          // Headers resolve but the body never produces a chunk or closes.
        },
      }),
      { headers: { "content-type": "application/json" } },
    );

  await expect(fetchNasaTransitRows(fetchImpl, { timeoutMs: 20, maxBytes: 4096 })).rejects.toThrow(
    "NASA TAP request timed out after 20 ms",
  );
});

it("writes only to the canonical real-systems snapshot path", () => {
  expect(snapshotOutputPath()).toMatch(/src\/config\/real-systems\.snapshot\.json$/);
});
