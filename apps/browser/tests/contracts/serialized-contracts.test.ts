/** Guards the serialized V4 and workspace-v1 compatibility boundary. */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { loadContractCorpus } from "../../../../scripts/check-contracts.mjs";
import { ContractValidator } from "../../../../scripts/lib/contract-validator.mjs";
import { canonicalScientificJson } from "../../src/infrastructure/science/canonicalJson";

const root = path.resolve(import.meta.dirname, "../../../../");
const readJson = <T>(file: string): T => JSON.parse(readFileSync(path.join(root, file), "utf8")) as T;
type ScienceV6Cases = {
  validImports: Record<string, Record<string, unknown>>;
  validImportContentSha256: Record<string, string>;
  invalidImports: Record<string, Record<string, unknown>>;
  validDescriptors: Record<string, Record<string, unknown>>;
  validRunManifest: Record<string, unknown>;
  validTransitTimingRequest: Record<string, unknown>;
  validTransitTimingResult: Record<string, unknown>;
  invalidTransitTimingRequests: Record<string, ContractMutation>;
  invalidDescriptors: Record<string, ContractMutation>;
  invalidRunManifests: Record<string, ContractMutation>;
  invalidTransitTimingResults: Record<string, ContractMutation>;
};
type ContractMutation = {
  source: string;
  set?: Record<string, unknown>;
  delete?: string[];
};

function documentAtPointer(
  document: Record<string, unknown>,
  pointer: string,
): [Record<string, unknown>, string] {
  const parts = pointer
    .split("/")
    .slice(1)
    .map((part) => part.replaceAll("~1", "/").replaceAll("~0", "~"));
  const key = parts.pop();
  if (key === undefined) throw new Error(`Invalid JSON pointer ${pointer}`);
  let target = document;
  for (const part of parts) target = target[part] as Record<string, unknown>;
  return [target, key];
}

function applyMutation(source: Record<string, unknown>, mutation: ContractMutation): Record<string, unknown> {
  const document = structuredClone(source);
  for (const [pointer, value] of Object.entries(mutation.set ?? {})) {
    const [target, key] = documentAtPointer(document, pointer);
    target[key] = value;
  }
  for (const pointer of mutation.delete ?? []) {
    const [target, key] = documentAtPointer(document, pointer);
    delete target[key];
  }
  return document;
}

describe("contract validator hardening", () => {
  const draft = "https://json-schema.org/draft/2020-12/schema";
  const schemaId = "https://example.test/schema.json";

  it("fails closed for inherited type names", () => {
    const schema = { $schema: draft, $id: schemaId, type: "constructor" };
    const validator = new ContractValidator(new Map([["schema", schema]]));

    expect(validator.validate(schema, {}, schemaId)).toBe(false);
    expect(validator.errors).toEqual(["/ must be constructor"]);
  });

  it("rejects inherited JSON pointer segments", () => {
    const schema = { $schema: draft, $id: schemaId, $ref: "#/constructor" };

    expect(() => new ContractValidator(new Map([["schema", schema]]))).toThrow(
      "schema has dangling $ref #/constructor.",
    );
  });

  it("rejects additional properties named after inherited object members", () => {
    const schema = {
      $schema: draft,
      $id: schemaId,
      type: "object",
      properties: {},
      additionalProperties: false,
    };
    const validator = new ContractValidator(new Map([["schema", schema]]));

    expect(validator.validate(schema, { constructor: "blocked" }, schemaId)).toBe(false);
    expect(validator.errors).toEqual(["/constructor is not allowed"]);
  });

  it("rejects schema patterns outside the audited subset", () => {
    const schema = { $schema: draft, $id: schemaId, type: "string", pattern: "(a+)+$" };
    const validator = new ContractValidator(new Map([["schema", schema]]));

    expect(() => validator.validate(schema, "aaaa!", schemaId)).toThrow(
      "Unsupported JSON Schema pattern: (a+)+$",
    );
  });
});

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

describe("serialized V6 science dataset contracts", () => {
  it("accepts all five declared-SI dataset families and additive descriptors", async () => {
    const corpus = await loadContractCorpus();
    const cases = readJson<ScienceV6Cases>("contracts/science-v6/contract-cases.json");
    for (const dataset of Object.values(cases.validImports))
      expect(corpus.validate("science-v6/dataset-import-v2.schema.json", dataset).valid).toBe(true);
    expect(
      corpus.validate("science-v6/dataset-descriptor-v2.schema.json", cases.validDescriptors.dataset).valid,
    ).toBe(true);
    expect(
      corpus.validate("science-v6/job-descriptor-v2.schema.json", cases.validDescriptors.job).valid,
    ).toBe(true);
    expect(
      corpus.validate("science-v6/artifact-descriptor-v2.schema.json", cases.validDescriptors.artifact).valid,
    ).toBe(true);
    expect(corpus.validate("science-v6/run-manifest-v3.schema.json", cases.validRunManifest).valid).toBe(
      true,
    );
  });

  it("matches the shared canonical dataset identities", () => {
    const cases = readJson<ScienceV6Cases>("contracts/science-v6/contract-cases.json");
    for (const [name, dataset] of Object.entries(cases.validImports)) {
      const digest = createHash("sha256").update(canonicalScientificJson(dataset)).digest("hex");
      expect(digest, name).toBe(cases.validImportContentSha256[name]);
    }
  });

  it("rejects unknown fields, non-canonical units, non-monotonic axes, and more than 100000 samples", async () => {
    const corpus = await loadContractCorpus();
    const cases = readJson<ScienceV6Cases>("contracts/science-v6/contract-cases.json");
    for (const name of ["unknownField", "wrongUnit", "nonMonotonic"])
      expect(
        corpus.validate("science-v6/dataset-import-v2.schema.json", cases.invalidImports[name]).valid,
      ).toBe(false);
    const oversize = structuredClone(cases.validImports.passbandResponse);
    const sampleCount = cases.invalidImports.oversizeCase.sampleCount as number;
    oversize.wavelengthM = Array.from({ length: sampleCount }, (_, index) => 4e-7 + index * 1e-12);
    oversize.response = Array.from({ length: sampleCount }, () => 0.5);
    expect(corpus.validate("science-v6/dataset-import-v2.schema.json", oversize).valid).toBe(false);
  });

  it("preserves every V6 mutation family's exact validation errors and order", async () => {
    const corpus = await loadContractCorpus();
    const cases = readJson<ScienceV6Cases>("contracts/science-v6/contract-cases.json");
    const timingErrors = {
      unknownField: ["/sampleCadenceSec is not allowed"],
      outputSet: ["/outputs/0 must equal const"],
      window: ["/window/endOffsetSec must be greater than startOffsetSec"],
      ephemeris: ["/series/0/referenceDurationT14Sec must be shorter than periodSec"],
      unknownOcculter: ["/series/0/occulterBodyId must name a scenario planet or moon"],
      datasetIds: ["/datasetIds has too many items", "/datasetIds has disallowed items"],
      observerTarget: ["/scenario/observer/targetBodyId must name a scenario body"],
      barycentre: ["/scenario/bodies must have a barycentric position"],
      initialContact: ["/scenario/bodies/1 must not start in finite-radius contact"],
      acceptedStepBudget: ["/scenario/integrator/maxStepSec must require at most 500000 accepted steps"],
      ephemerisCellBudget: ["/window must span no more than 10000 requested half-open ephemeris cells"],
    };
    for (const [name, mutation] of Object.entries(cases.invalidTransitTimingRequests)) {
      const document = applyMutation(cases.validTransitTimingRequest, mutation);
      expect(
        corpus.validate("science-v6/transit-timing-request-v1.schema.json", document).errors,
        name,
      ).toEqual(timingErrors[name as keyof typeof timingErrors]);
    }

    const descriptorErrors = {
      failedJobWithoutError: ["/ must include error"],
      nonFailedJobWithError: ["/ must not match"],
      artifactDataSchema: ["/dataSchemaVersion must equal const"],
      artifactByteCount: ["/byteCount is below minimum"],
    };
    for (const [name, mutation] of Object.entries(cases.invalidDescriptors)) {
      const sourceName = mutation.source.split(".").at(-1);
      if (sourceName === undefined) throw new Error(`Invalid mutation source ${mutation.source}`);
      const schema = name.startsWith("artifact")
        ? "science-v6/artifact-descriptor-v2.schema.json"
        : "science-v6/job-descriptor-v2.schema.json";
      const document = applyMutation(cases.validDescriptors[sourceName], mutation);
      expect(corpus.validate(schema, document).errors, name).toEqual(
        descriptorErrors[name as keyof typeof descriptorErrors],
      );
    }

    const manifestErrors = {
      unknownField: ["/displayCadenceSec is not allowed"],
      coordinateConvention: ["/lineOfSightDirection must equal const"],
      errorCeiling: ["/numericalErrorEstimates/1/valueSec is above maximum"],
    };
    for (const [name, mutation] of Object.entries(cases.invalidRunManifests)) {
      const document = applyMutation(cases.validRunManifest, mutation);
      expect(corpus.validate("science-v6/run-manifest-v3.schema.json", document).errors, name).toEqual(
        manifestErrors[name as keyof typeof manifestErrors],
      );
    }

    const resultErrors = {
      unknownField: ["/sampleCadenceSec is not allowed"],
      outputArtifact: [
        "/artifacts/0/dataSchemaVersion must equal const",
        "/artifacts/0/kind must equal const",
        "/runManifest/artifacts must exactly match result artifacts",
        "/artifacts/0 must be a transit-events-v1 artifact",
      ],
      manifestArtifactLink: ["/runManifest/artifacts must exactly match result artifacts"],
    };
    for (const [name, mutation] of Object.entries(cases.invalidTransitTimingResults)) {
      const document = applyMutation(cases.validTransitTimingResult, mutation);
      expect(
        corpus.validate("science-v6/transit-timing-result-v1.schema.json", document).errors,
        name,
      ).toEqual(resultErrors[name as keyof typeof resultErrors]);
    }
  });
});
