/** Guards the serialized V4 and workspace-v1 compatibility boundary. */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { loadContractCorpus } from "../../../../scripts/check-contracts.mjs";

const root = path.resolve(import.meta.dirname, "../../../../");
const readJson = <T>(file: string): T => JSON.parse(readFileSync(path.join(root, file), "utf8")) as T;

describe("serialized V4 contracts", () => {
  it("accepts optional body masses and both V4 modes", async () => {
    const fixture = readJson<{ scenarios: Array<{ scenario: Record<string, unknown> }> }>(
      "contracts/education-v4/fixtures/scoped-parity.json",
    );
    const scenario = structuredClone(fixture.scenarios[0].scenario);
    const bodies = scenario.bodies as Record<string, Array<Record<string, unknown>>>;
    [...bodies.stars, ...bodies.planets, ...bodies.moons].forEach((body) => delete body.m);
    expect((await loadContractCorpus()).validate("education-v4/scenario.schema.json", scenario).valid).toBe(
      true,
    );
  });

  it("accepts detached-binary workspaces and rejects invalid serializations", async () => {
    const corpus = await loadContractCorpus();
    const workspace = readJson<Record<string, unknown>>(
      "contracts/workspace-v1/fixtures/education-workspace.json",
    );
    expect(corpus.validate("workspace-v1/workspace.schema.json", workspace).valid).toBe(true);
    workspace.schemaVersion = "workspace-v2";
    expect(corpus.validate("workspace-v1/workspace.schema.json", workspace).valid).toBe(false);
    const scenario = readJson<{ scenarios: Array<{ scenario: Record<string, unknown> }> }>(
      "contracts/education-v4/fixtures/scoped-parity.json",
    ).scenarios[0].scenario;
    scenario.baselineFlux = 1;
    expect(corpus.validate("education-v4/scenario.schema.json", scenario).valid).toBe(false);
  });
});
