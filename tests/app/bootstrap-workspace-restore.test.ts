// @vitest-environment jsdom
/** Exercises portable workspace import through the public bootstrap listener. */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { cloneParams } from "../../src/core/clone";
import type { SystemParams } from "../../src/core/types";
import { getPresetById } from "../../src/app/presets";
import { wireBootstrapPersistence } from "../../src/app/bootstrapPersistence";
import { initNoiseState } from "../../src/app/noise";
import type { ScenarioFlowDeps, ScenarioFlowState } from "../../src/app/scenarioFlow";
import { createBinaryLabState } from "../../src/didactics/binaryLab";
import { buildScientificForwardRequestFromSystemParams } from "../../src/science";
import { migrateSystemParamsToV4, toSystemParamsV2FromV4 } from "../../src/sim/v4";
import { DEFAULT_PRODUCT_VIEW_STATE } from "../../src/ui/productViewState";
import type { UiRefs } from "../../src/ui/refs";
import {
  encodeWorkspaceDocument,
  workspaceGuidedLabState,
  type WorkspaceDocumentV1,
} from "../../src/workspace/workspaceDocument";

const mocks = vi.hoisted(() => ({
  applied: vi.fn(async () => undefined),
  syncDidactics: vi.fn(),
}));

vi.mock("../../src/app/scenarioFlow", () => ({
  applyScenarioParams: mocks.applied,
  isBinaryModeActive: () => false,
  withScenarioApplyGuard: async (
    _guard: unknown,
    _refs: unknown,
    _statusEl: unknown,
    run: () => Promise<void>,
  ) => run(),
}));

vi.mock("../../src/app/didactics", () => ({
  syncDidacticsControlsFromParams: mocks.syncDidactics,
}));

function installDom(): void {
  document.body.innerHTML = `
    <button id="workspaceOpenBtn"></button>
    <button id="workspaceSaveBtn"></button>
    <input id="workspaceFileInput" type="file" />
    <input id="scienceDurationHours" type="number" value="1" />
    <input id="scienceCadenceSec" type="number" value="2" />
    <input id="scienceSeed" type="number" value="3" />
    <span id="warn"></span>
  `;
}

function select(values: string[]): HTMLSelectElement {
  const element = document.createElement("select");
  for (const value of values) element.add(new Option(value, value));
  return element;
}

function refs(): UiRefs {
  return {
    productProfileSelect: select(["education", "scientific"]),
    productModeSelect: select(["simulation", "lab"]),
    uiModeSelect: select(["normal", "expert"]),
    simModeSelect: select(["preset-lab", "binary-lab"]),
    runtimeModeSelect: select(["realtime", "reference"]),
    presetSelect: select(["default"]),
    presetDesc: document.createElement("p"),
    realSystemSelect: select([""]),
    realSystemMeta: document.createElement("p"),
    didLessonSelect: select(["kepler-geometry"]),
  } as unknown as UiRefs;
}

function workspaceDocument(
  options: { startOffsetSec?: number; lessonId?: string } = {},
): WorkspaceDocumentV1 {
  const params = importedScenarioParams();
  const request = buildScientificForwardRequestFromSystemParams({
    system: params,
    binaryMode: false,
    startOffsetSec: options.startOffsetSec ?? 0,
    endOffsetSec: 7_200,
    sampleCadenceSec: 120,
    seed: 41,
  });
  const learning = {
    lessonId: options.lessonId ?? "kepler-geometry",
    stepIndex: 1,
    phaseIndex: 0,
    passedStepIds: ["intro"],
  };
  return {
    schemaVersion: "workspace-v1",
    productContext: { ...DEFAULT_PRODUCT_VIEW_STATE, profile: "scientific", mode: "lab", ui: "advanced" },
    education: {
      scenario: migrateSystemParamsToV4(params),
      guidedLab: workspaceGuidedLabState({
        learning,
        responses: { "kepler-geometry:intro:phase-0": { primary: "My prediction" } },
        hintLevel: "L2",
        binaryLab: {
          ...createBinaryLabState(),
          revealed: true,
          skyVisible: true,
          hypothesis: "primary-eclipse-deepest",
        },
      }),
    },
    scientific: { request },
  };
}

function importedScenarioParams(): SystemParams {
  const params = cloneParams(getPresetById("default").params);
  params.observer = { dir: { x: 1, y: 0, z: 0 } };
  return params;
}

function attachFile(text: string): void {
  const input = document.getElementById("workspaceFileInput") as HTMLInputElement;
  Object.defineProperty(input, "files", {
    configurable: true,
    value: [{ text: async () => text }],
  });
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function setup() {
  installDom();
  const liveParams = cloneParams(getPresetById("default").params);
  const state: ScenarioFlowState = {
    scenarioDefaults: cloneParams(liveParams),
    params: liveParams,
    didacticsRuntime: {
      learning: { lessonId: "kepler-geometry", stepIndex: 0, phaseIndex: 0, passedStepIds: [] },
      responses: {},
    },
    noise: initNoiseState(liveParams),
    binaryLabState: createBinaryLabState(),
  };
  const events: string[] = [];
  const appRefs = refs();
  const scenarioDeps: ScenarioFlowDeps = {
    refs: appRefs,
    state,
    getTimeSec: () => 12_345,
    rebuildSimulationFromParams: vi.fn(async () => undefined),
    resetSimTimeAndLC: vi.fn(),
  };
  const args: Parameters<typeof wireBootstrapPersistence>[0] = {
    refs: appRefs,
    state,
    fallbackLesson: "kepler-geometry",
    applyGuard: { applying: false },
    scenarioDeps,
    profileController: { syncFromControl: () => events.push("profile") },
    currentLessonSimMode: () => "preset-lab",
    setRestoringHistory: (restoring) => events.push(`restoring:${restoring}`),
    syncModeNavigation: () => events.push("navigation"),
    syncBinaryUi: () => events.push("binary"),
    renderDidacticsSurface: () => events.push("didactics"),
    invalidate: () => events.push("invalidate"),
    applyActive: async () => undefined,
    setAppStatus: (message) => events.push(`status:${message}`),
    writeProductHistory: (kind) => events.push(`history:${kind}`),
    warnEl: document.getElementById("warn"),
    signal: new AbortController().signal,
  };
  mocks.applied.mockImplementation(async (...callArgs: unknown[]) => {
    const [deps, nextParams] = callArgs as [ScenarioFlowDeps, SystemParams];
    events.push("apply");
    deps.state.params = cloneParams(nextParams);
  });
  mocks.syncDidactics.mockImplementation(() => events.push("sync-didactics"));
  wireBootstrapPersistence(args);
  return { args, events, scenarioDeps, state };
}

function failedRestoreSnapshot(args: Parameters<typeof wireBootstrapPersistence>[0]) {
  return structuredClone({
    productControls: {
      profile: args.refs.productProfileSelect.value,
      mode: args.refs.productModeSelect.value,
      ui: args.refs.uiModeSelect.value,
      lab: args.refs.simModeSelect?.value,
      runtime: args.refs.runtimeModeSelect?.value,
      preset: args.refs.presetSelect.value,
      presetDescription: args.refs.presetDesc.textContent,
      realSystem: args.refs.realSystemSelect?.value,
      realSystemMeta: args.refs.realSystemMeta?.textContent,
      lesson: args.refs.didLessonSelect?.value,
      documentProductMode: document.documentElement.dataset.productMode,
      documentUiMode: document.documentElement.dataset.uiMode,
    },
    scientificControls: {
      durationHours: (document.getElementById("scienceDurationHours") as HTMLInputElement).value,
      cadenceSec: (document.getElementById("scienceCadenceSec") as HTMLInputElement).value,
      seed: (document.getElementById("scienceSeed") as HTMLInputElement).value,
    },
    state: {
      params: args.state.params,
      didacticsRuntime: args.state.didacticsRuntime,
      binaryLabState: args.state.binaryLabState,
    },
  });
}

beforeEach(() => {
  mocks.applied.mockReset();
  mocks.syncDidactics.mockReset();
});

describe("workspace restore", () => {
  it("restores a guided Scientific workspace through the file input", async () => {
    const { args, events, scenarioDeps, state } = setup();
    const workspace = workspaceDocument();
    const importedParams = toSystemParamsV2FromV4(workspace.education.scenario);
    expect(importedParams).not.toEqual(state.params);
    attachFile(encodeWorkspaceDocument(workspace));

    await vi.waitFor(() => expect(events).toContain("history:replace"));

    const expectedLearning = {
      ...workspace.education.guidedLab!.learning,
      passedStepIds: [...workspace.education.guidedLab!.learning.passedStepIds],
    };
    const expectedParams = {
      ...importedParams,
      didactics: {
        ...(importedParams.didactics ?? {}),
        activeLessonId: expectedLearning.lessonId,
        hintLevel: workspace.education.guidedLab!.hintLevel,
        learningState: expectedLearning,
      },
    };
    expect(args.refs.productProfileSelect.value).toBe("scientific");
    expect(args.refs.productModeSelect.value).toBe("lab");
    expect(args.refs.uiModeSelect.value).toBe("expert");
    expect(args.refs.simModeSelect?.value).toBe("preset-lab");
    expect(args.refs.runtimeModeSelect?.value).toBe("realtime");
    expect(args.refs.presetSelect.value).toBe("default");
    expect(args.refs.didLessonSelect?.value).toBe("kepler-geometry");
    expect(document.documentElement.dataset).toMatchObject({ productMode: "lab", uiMode: "expert" });
    expect((document.getElementById("scienceDurationHours") as HTMLInputElement).valueAsNumber).toBe(2);
    expect((document.getElementById("scienceCadenceSec") as HTMLInputElement).valueAsNumber).toBe(120);
    expect((document.getElementById("scienceSeed") as HTMLInputElement).valueAsNumber).toBe(41);
    expect(state.params).toEqual(expectedParams);
    expect(state.didacticsRuntime).toEqual({
      learning: expectedLearning,
      responses: { "kepler-geometry:intro:phase-0": { primary: "My prediction" } },
    });
    expect(state.didacticsRuntime.learning).not.toBe(workspace.education.guidedLab!.learning);
    expect(state.didacticsRuntime.learning.passedStepIds).not.toBe(
      workspace.education.guidedLab!.learning.passedStepIds,
    );
    expect(state.didacticsRuntime.responses).not.toBe(workspace.education.guidedLab!.responses);
    expect(state.binaryLabState).toEqual({
      ...createBinaryLabState(),
      revealed: true,
      skyVisible: true,
      hypothesis: "primary-eclipse-deepest",
    });
    expect(mocks.applied).toHaveBeenCalledExactlyOnceWith(scenarioDeps, importedParams, {
      syncUi: true,
      resetNoise: true,
    });
    expect(events).toEqual([
      "restoring:true",
      "profile",
      "navigation",
      "apply",
      "sync-didactics",
      "binary",
      "didactics",
      "invalidate",
      "status:Workspace restored. Transient histories and playback time were reset.",
      "restoring:false",
      "history:replace",
    ]);
  });

  it("reports malformed documents before changing the active workspace", async () => {
    const { args, events } = setup();
    const before = failedRestoreSnapshot(args);
    attachFile("{not valid JSON");

    await vi.waitFor(() =>
      expect(document.getElementById("warn")?.textContent).toBe(
        "Workspace import failed: Workspace file is not valid JSON: Expected property name or '}' in JSON at position 1 (line 1 column 2)",
      ),
    );

    expect(failedRestoreSnapshot(args)).toEqual(before);
    expect(events).toEqual([]);
    expect(mocks.applied).not.toHaveBeenCalled();
  });

  it("rejects nonzero Scientific offsets before changing the active workspace", async () => {
    const { args, events } = setup();
    const before = failedRestoreSnapshot(args);
    attachFile(encodeWorkspaceDocument(workspaceDocument({ startOffsetSec: 60 })));

    await vi.waitFor(() =>
      expect(document.getElementById("warn")?.textContent).toBe(
        "Workspace import failed: This website can restore Scientific workspaces only when startOffsetSec is zero.",
      ),
    );

    expect(failedRestoreSnapshot(args)).toEqual(before);
    expect(events).toEqual([]);
    expect(mocks.applied).not.toHaveBeenCalled();
  });

  it("keeps the established correction status wording", async () => {
    const { events } = setup();
    attachFile(encodeWorkspaceDocument(workspaceDocument({ lessonId: "unknown-lesson" })));

    await vi.waitFor(() => expect(events).toContain("history:replace"));

    expect(events).toContain(
      'status:Workspace restored with corrections. Unknown lesson "unknown-lesson"; using "kepler-geometry".',
    );
  });
});
