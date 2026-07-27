/** Verifies real systems snapshot freshness behavior for reproducible data and migration workflows. */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const MAX_SNAPSHOT_AGE_DAYS = 120;

describe("real systems snapshot freshness", () => {
  it("keeps the committed NASA snapshot reasonably fresh", () => {
    const snapshot = JSON.parse(
      readFileSync(`${process.cwd()}/src/config/real-systems.snapshot.json`, "utf8"),
    ) as { meta?: { fetchedAt?: string; source?: string } };

    const fetchedAt = Date.parse(snapshot.meta?.fetchedAt ?? "");
    expect(Number.isFinite(fetchedAt)).toBe(true);
    expect(snapshot.meta?.source).toContain("NASA");

    const ageDays = (Date.now() - fetchedAt) / (1000 * 60 * 60 * 24);
    expect(ageDays).toBeLessThanOrEqual(MAX_SNAPSHOT_AGE_DAYS);
  });
});
