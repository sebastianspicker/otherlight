/** Verifies strict workspace-v1 persistence, migration, and untrusted-document rejection. */
import { describe, expect, it } from "vitest";
import { getPresetById } from "../../src/app/presets";
import { buildScientificForwardRequestFromSystemParams } from "../../src/science/scenarioAdapter";
import { migrateSystemParamsToV4 } from "../../src/sim/v4";
import { DEFAULT_PRODUCT_VIEW_STATE } from "../../src/ui/productViewState";
import {
  encodeWorkspaceDocument,
  parseWorkspaceDocument,
  parseWorkspaceDocumentJson,
  workspaceGuidedLabState,
  type WorkspaceDocumentV1,
} from "../../src/workspace/workspaceDocument";

const params = getPresetById("default").params;
const guidedLabFixture: Parameters<typeof workspaceGuidedLabState>[0] = {
  learning: { lessonId: "kepler-geometry", stepIndex: 1, phaseIndex: 0, passedStepIds: ["intro"] },
  responses: { "kepler-geometry:intro:phase-0": { primary: "My prediction", updatedAtSec: 99 } },
  hintLevel: "L2",
  binaryLab: {
    skyVisible: true,
    revealed: true,
    hypothesis: "primary-eclipse-deepest",
    hideSkyUntilReveal: true,
    requireHypothesis: true,
    lockParamsUntilHypothesis: true,
  },
};

function documentFixture(): WorkspaceDocumentV1 {
  return {
    schemaVersion: "workspace-v1",
    productContext: { ...DEFAULT_PRODUCT_VIEW_STATE, mode: "lab" },
    education: {
      scenario: migrateSystemParamsToV4(params),
      guidedLab: workspaceGuidedLabState(guidedLabFixture),
    },
  };
}

describe("workspace-v1 document", () => {
  it("round-trips only durable workspace state with stable JSON", () => {
    const fixture = documentFixture();
    const encoded = encodeWorkspaceDocument(fixture);
    expect(encoded).toBe(encodeWorkspaceDocument(fixture));
    expect(parseWorkspaceDocumentJson(encoded)).toEqual(fixture);
    expect(encoded).not.toContain("updatedAtSec");
    expect(encoded).not.toContain("latestSignals");
  });

  it("rejects unknown keys and unsupported schema versions", () => {
    const fixture = documentFixture();
    expect(() => parseWorkspaceDocument({ ...fixture, extra: true })).toThrow("workspace.extra");
    expect(() => parseWorkspaceDocument({ ...fixture, schemaVersion: "workspace-v2" })).toThrow(
      "workspace.schemaVersion",
    );
  });

  it.each([-1, 1.5, "1"])("rejects invalid guided-lab step index %s", (stepIndex) => {
    const fixture = documentFixture();
    (fixture.education.guidedLab!.learning as Record<string, unknown>).stepIndex = stepIndex;
    expect(() => parseWorkspaceDocument(fixture)).toThrow(
      "education.guidedLab.learning.stepIndex must be a non-negative integer",
    );
  });

  it("rejects a negative optional guided-lab phase index", () => {
    const fixture = documentFixture();
    fixture.education.guidedLab!.learning.phaseIndex = -1;
    expect(() => parseWorkspaceDocument(fixture)).toThrow(
      "education.guidedLab.learning.phaseIndex must be a non-negative integer",
    );
  });

  it("rejects malformed V4 scenarios before callers can apply state", () => {
    const fixture = documentFixture();
    expect(() =>
      parseWorkspaceDocument({ ...fixture, education: { scenario: { version: "4", mode: "general-lab" } } }),
    ).toThrow("education.scenario is not a valid V4 configuration");
  });

  it("requires a validated forward scientific request", () => {
    const fixture = documentFixture();
    const request = buildScientificForwardRequestFromSystemParams({
      system: params,
      binaryMode: false,
      targetBodyId: "planet",
      startOffsetSec: 0,
      endOffsetSec: 100,
      sampleCadenceSec: 10,
      seed: 1,
    });
    const scientificFixture = {
      ...fixture,
      productContext: { ...fixture.productContext, profile: "scientific" as const },
      scientific: { request },
    };
    expect(parseWorkspaceDocument(scientificFixture).scientific?.request).toEqual(request);
    expect(() =>
      parseWorkspaceDocument({
        ...fixture,
        productContext: { ...fixture.productContext, profile: "scientific" },
        scientific: { request: { kind: "forward" } },
      }),
    ).toThrow("scientific.request is invalid");
    expect(() =>
      parseWorkspaceDocument({
        ...fixture,
        productContext: { ...fixture.productContext, profile: "scientific" },
      }),
    ).toThrow("workspace.scientific");
    expect(() =>
      parseWorkspaceDocument({
        ...fixture,
        scientific: { request },
      }),
    ).toThrow("workspace.scientific");
  });

  it("preserves deliberately empty guided-response drafts", () => {
    const fixture = documentFixture();
    fixture.education.guidedLab!.responses["kepler-geometry:intro:phase-0"] = {
      primary: "",
      secondary: "",
    };
    expect(parseWorkspaceDocumentJson(encodeWorkspaceDocument(fixture))).toEqual(fixture);
  });

  it("does not mutate the supplied object on parse failure", () => {
    const malformed: Record<string, unknown> = { ...documentFixture(), schemaVersion: "workspace-v0" };
    const before = JSON.stringify(malformed);
    expect(() => parseWorkspaceDocument(malformed)).toThrow();
    expect(JSON.stringify(malformed)).toBe(before);
  });
});
