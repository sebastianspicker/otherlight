import { describe, expect, it } from "vitest";

const scriptMod = await import(
  new URL("../../scripts/fetch-real-systems-snapshot.mjs", import.meta.url).href
);

const {
  normalizeNasaRow,
  selectTopSystems,
  buildSnapshotFromRows,
  scoreSnapshotEntry,
}: {
  normalizeNasaRow: (row: Record<string, unknown>) => any;
  selectTopSystems: (rows: any[], limit?: number) => any[];
  buildSnapshotFromRows: (
    rows: Record<string, unknown>[],
    opts?: { fetchedAt?: string; limit?: number },
  ) => any;
  scoreSnapshotEntry: (entry: any) => number;
} = scriptMod as any;

describe("fetch-real-systems-snapshot script", () => {
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

    const out = selectTopSystems(rows as any[], 2);

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

    const snapshot = buildSnapshotFromRows(rows as any[], {
      fetchedAt: "2026-02-19T10:00:00.000Z",
      limit: 20,
    });

    expect(snapshot.meta.fetchedAt).toBe("2026-02-19T10:00:00.000Z");
    expect(snapshot.meta.rowCount).toBe(1);
    expect(snapshot.systems).toHaveLength(1);
    expect(snapshot.systems[0].id).toBe("keep-1-b");
  });
});
