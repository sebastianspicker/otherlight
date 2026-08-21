// @vitest-environment jsdom
/** Exercises the website behaviors advertised by the capability manifest. */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { readTimeSpeed } from "../../src/app/actions";
import { PRESETS } from "../../src/app/presets";
import { REAL_SYSTEMS_OPTIONS } from "../../src/app/realSystems";
import {
  createInstrumentNoiseState,
  applyInstrumentNoiseAndSystematics,
} from "../../src/photometry/instrumentNoise";
import {
  createLightCurveHistoryState,
  clearLightCurveHistory,
  pushLightCurveSample,
} from "../../src/render/lightCurvePlotBuffer";
import { createReferenceSimulationV4 } from "../../src/sim/v4/referenceClient";
import { DEFAULT_BINARY_LAB_CONFIG_V4 } from "../../src/app/binaryLab";
import { atmosphereOpacityForOcculter, circleOverlapArea } from "../../src/sim/v4/nativePhotometry";
import {
  createBinaryLabState,
  canEditParams,
  canRevealSky,
  revealSky,
  setHypothesis,
} from "../../src/didactics/binaryLab";
import { getParamUiMeta } from "../../src/ui/paramValidation";
import {
  DEFAULT_PRODUCT_VIEW_STATE,
  parseProductViewState,
  serializeProductViewState,
} from "../../src/ui/productViewState";
import { WORKSPACE_SCHEMA_VERSION } from "../../src/workspace/workspaceDocument";

type PlatformStatus = {
  status: "available" | "experimental" | "unavailable";
  availability?: "capability-gated";
  evidence: string[];
  reason?: string;
};
type Capability = {
  id: string;
  area: string;
  title: string;
  website: PlatformStatus;
  macos: PlatformStatus;
  iphone: PlatformStatus;
  ipad: PlatformStatus;
};

const manifest = JSON.parse(readFileSync("contracts/capabilities-v1/manifest.json", "utf8")) as {
  schemaVersion: string;
  capabilities: Capability[];
};

const appleUnimplementedCapabilityIds = new Set([
  "education.runtime-reference",
  "education.binary-photometry",
  "education.atmosphere-photometry",
  "education.measurement-noise",
  "education.nbody-runtime",
  "education.relativity-runtime",
  "labs.binary-black-box",
]);

describe("cross-platform capability manifest", () => {
  it("keeps stable manifest invariants and existing website evidence", () => {
    expect(manifest.schemaVersion).toBe("capabilities-v1");
    const ids = manifest.capabilities.map(({ id }) => id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const capability of manifest.capabilities) {
      expect(capability.id).toMatch(/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/);
      expect(capability.title.length).toBeGreaterThan(0);
      for (const platform of [capability.website, capability.macos, capability.iphone, capability.ipad]) {
        if (platform.status === "available")
          expect(platform.evidence.length, capability.id).toBeGreaterThan(0);
        if (platform.status !== "available")
          expect(platform.reason?.length, capability.id).toBeGreaterThan(0);
        for (const evidence of platform.evidence)
          expect(existsSync(path.join(process.cwd(), evidence)), evidence).toBe(true);
      }
    }
  });

  it("retains Apple delivery and scientific capability-gate invariants", () => {
    for (const capability of manifest.capabilities) {
      for (const [name, platform] of Object.entries({ iphone: capability.iphone, ipad: capability.ipad })) {
        if (platform.status === "experimental")
          expect(platform.reason, `${capability.id}:${name}`).toMatch(/Xcode 26\.6|simulator|device|gate/i);
      }
      if (capability.area === "science") {
        expect(capability.iphone.status, capability.id).toBe("unavailable");
        expect(capability.ipad.status, capability.id).toBe("unavailable");
        if (capability.website.status === "available")
          expect(capability.website.availability, capability.id).toBe("capability-gated");
      }
    }

    const matching = manifest.capabilities.filter(({ id }) => appleUnimplementedCapabilityIds.has(id));
    expect(matching.map(({ id }) => id).sort()).toEqual([...appleUnimplementedCapabilityIds].sort());
    for (const capability of matching) {
      for (const platform of [capability.iphone, capability.ipad]) {
        expect(platform.status, capability.id).toBe("unavailable");
        expect(platform.evidence, capability.id).toEqual([]);
        expect(platform.reason, capability.id).toMatch(/not implemented in the shared Apple application/i);
      }
    }
  });

  it("directly exercises the website behaviors behind the repaired claims", async () => {
    const shared = { ...DEFAULT_PRODUCT_VIEW_STATE, mode: "lab" as const, runtime: "reference" as const };
    expect(parseProductViewState(serializeProductViewState(shared)).state).toEqual(shared);
    expect(WORKSPACE_SCHEMA_VERSION).toBe("workspace-v1");
    expect(PRESETS.length).toBeGreaterThan(1);
    expect(REAL_SYSTEMS_OPTIONS.length).toBeGreaterThan(0);

    const speed = document.createElement("input");
    speed.value = "800";
    const multiplier = document.createElement("select");
    multiplier.innerHTML = '<option value="4" selected>4x</option>';
    expect(readTimeSpeed(speed, undefined, multiplier)).toBe(3200);
    const eccentricity = document.createElement("input");
    eccentricity.id = "planetE";
    eccentricity.value = "0.2";
    expect(getParamUiMeta(eccentricity).id).toBe("planetE");

    const reference = createReferenceSimulationV4(DEFAULT_BINARY_LAB_CONFIG_V4);
    await reference.prepare();
    expect(reference.getMode()).toBe("realtime");
    expect(Number.isFinite(reference.step(0).flux.total)).toBe(true);
    expect(circleOverlapArea(1, 1, 0)).toBeCloseTo(Math.PI);
    expect(
      atmosphereOpacityForOcculter(DEFAULT_BINARY_LAB_CONFIG_V4, { kind: "planet", r: 1 }),
    ).toBeGreaterThanOrEqual(0);

    const noiseA = createInstrumentNoiseState(17);
    const noiseB = createInstrumentNoiseState(17);
    const noiseCfg = {
      enabled: true,
      seed: 17,
      electronsPerUnitFlux: 1e6,
      exposureSec: 1,
      throughput: 1,
      photonNoise: { enabled: false },
      readNoise: { enabled: false },
      correlatedNoise: { enabled: false },
      trends: { enabled: false },
    };
    expect(applyInstrumentNoiseAndSystematics({ flux: 1, tSec: 1, cfg: noiseCfg, state: noiseA })).toBe(
      applyInstrumentNoiseAndSystematics({ flux: 1, tSec: 1, cfg: noiseCfg, state: noiseB }),
    );

    const history = createLightCurveHistoryState(10);
    pushLightCurveSample(history, { t: 1, flux: 0.99 });
    clearLightCurveHistory(history);
    expect(history.flux).toEqual([]);

    const lab = setHypothesis(createBinaryLabState(), "primary-eclipse-deepest");
    expect(canRevealSky(lab)).toBe(true);
    expect(canEditParams(lab)).toBe(true);
    expect(revealSky(lab).skyVisible).toBe(true);
  });
});
