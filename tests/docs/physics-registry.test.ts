/** Verifies physics-registry documentation stays synchronized with supported behavior. */

import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

type RegistryModel = {
  id: string;
  status: string;
  owners: string[];
  tests: string[];
  references: string[];
};

describe("physics model registry", () => {
  it("uses unique stable ids and supported status values", async () => {
    const raw = await readFile("docs/physics/model-registry.json", "utf8");
    const registry = JSON.parse(raw) as { statusValues: string[]; models: RegistryModel[] };
    const ids = registry.models.map((model) => model.id);

    expect(new Set(ids).size).toBe(ids.length);
    for (const model of registry.models) {
      expect(registry.statusValues).toContain(model.status);
      expect(model.owners.length).toBeGreaterThan(0);
      expect(model.tests.length).toBeGreaterThan(0);
      expect(model.references.length).toBeGreaterThan(0);
    }
  });
});
