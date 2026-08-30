/** Verifies the Browser draft and V4 scenario remain distinct, explicit model names. */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const readSource = (file: string): string =>
  readFileSync(path.join(process.cwd(), "apps/browser/src", file), "utf8");

describe("scenario model surface", () => {
  it("exports BrowserScenarioDraft without the removed SystemParams production alias", () => {
    const source = readSource("domain/model/typesSystem.ts");

    expect(source).toContain("export type BrowserScenarioDraft = {");
    expect(source).toContain("export type SystemParamsV2 = BrowserScenarioDraft;");
    expect(source).not.toMatch(/export\\s+type\\s+SystemParams\\s*=/);
  });

  it("exports EducationScenarioV4 without deprecated V4 aliases", () => {
    const types = readSource("domain/simulation/v4/types.ts");
    const index = readSource("domain/simulation/v4/index.ts");

    expect(types).toContain("export type EducationScenarioV4 = {");
    expect(types).not.toMatch(/\\bSimulationConfigV4\\b|\\bSystemParamsV4\\b/);
    expect(index).not.toMatch(/\\bSimulationConfigV4\\b|\\bSystemParamsV4\\b/);
  });
});
