import type { DidacticSignals, LearningState, SystemParams } from "../core/types";
import { toFiniteNumber } from "../core/units";
import {
  advanceLearningState,
  buildLessonReportMarkdown,
  DEFAULT_LESSON_ID,
  getLessonById,
  LESSONS,
  resolveLearningState,
} from "../didactics";
import type { UiRefs } from "../ui/refs";

export type DidacticsRuntimeState = {
  learning: LearningState;
  latestSignals?: DidacticSignals;
};

export function ensureDidacticsConfig(system: SystemParams): void {
  system.didactics = system.didactics ?? {};
  system.didactics.enabled = system.didactics.enabled ?? true;
  system.didactics.activeLessonId = system.didactics.activeLessonId ?? DEFAULT_LESSON_ID;
  system.didactics.autoAssess = system.didactics.autoAssess ?? true;
}

export function initDidacticsRuntime(system: SystemParams, tSec: number): DidacticsRuntimeState {
  ensureDidacticsConfig(system);
  const learning = resolveLearningState(system, tSec);
  system.didactics!.learningState = learning;
  return { learning };
}

export function syncDidacticsControlsFromParams(system: SystemParams, refs: UiRefs): void {
  ensureDidacticsConfig(system);
  const select = refs.didLessonSelect;
  const auto = refs.didAutoAssess;
  if (select) select.value = system.didactics?.activeLessonId ?? DEFAULT_LESSON_ID;
  if (auto) auto.checked = Boolean(system.didactics?.autoAssess ?? true);
}

export function populateDidacticsControls(refs: UiRefs): void {
  const lessonSelect = refs.didLessonSelect;
  if (lessonSelect) {
    lessonSelect.replaceChildren();
    for (const lesson of LESSONS) {
      const opt = document.createElement("option");
      opt.value = lesson.id;
      opt.textContent = lesson.title;
      lessonSelect.appendChild(opt);
    }
  }
}

export function onDidacticSignals(
  system: SystemParams,
  runtime: DidacticsRuntimeState,
  signals: DidacticSignals | undefined,
  tSec: number,
): DidacticsRuntimeState {
  if (!system.didactics?.enabled) return runtime;
  const auto = Boolean(system.didactics.autoAssess ?? true);
  const nextLearning = advanceLearningState(runtime.learning, signals, auto, tSec);
  system.didactics.learningState = nextLearning;
  return { learning: nextLearning, latestSignals: signals };
}

export function forceNextLessonStep(
  system: SystemParams,
  runtime: DidacticsRuntimeState,
  tSec: number,
): DidacticsRuntimeState {
  const lesson = getLessonById(runtime.learning.lessonId);
  const maxStep = Math.max(lesson.steps.length - 1, 0);
  const next = {
    ...runtime.learning,
    stepIndex: Math.min(runtime.learning.stepIndex + 1, maxStep),
    updatedAtSec: tSec,
  };
  if (system.didactics) system.didactics.learningState = next;
  return { ...runtime, learning: next };
}

export function renderDidacticSignals(refs: UiRefs, runtime: DidacticsRuntimeState): void {
  const signals = runtime.latestSignals;
  if (refs.didLessonStatus) {
    if (!signals) {
      refs.didLessonStatus.textContent = "Didactics disabled.";
    } else {
      const score = (toFiniteNumber(signals.score, 0) * 100).toFixed(0);
      const rubric = signals.rubricV2 ? ` · rubric ${(signals.rubricV2.score * 100).toFixed(0)}%` : "";
      refs.didLessonStatus.textContent = `${signals.lessonTitle ?? "Lesson"} · ${signals.stepTitle ?? ""} · score ${score}%${rubric}`;
    }
  }

  if (refs.didCheckList) {
    refs.didCheckList.innerHTML = "";
    const checks = signals?.checks ?? [];
    for (const c of checks) {
      const row = document.createElement("div");
      row.textContent = `${c.passed ? "PASS" : "FAIL"} · ${c.label} · observed=${c.observed ?? "n/a"} expected=${c.expected ?? "n/a"}`;
      refs.didCheckList.appendChild(row);
    }
    if (signals?.prompt) {
      const p = document.createElement("div");
      p.textContent = `Task: ${signals.prompt}`;
      refs.didCheckList.appendChild(p);
    }
  }

  if (refs.didFormulaList) {
    refs.didFormulaList.innerHTML = "";
    for (const f of signals?.formulas ?? []) {
      const row = document.createElement("div");
      row.textContent = `${f.title}: ${f.latex} = ${f.value}${f.unit ? ` ${f.unit}` : ""}`;
      refs.didFormulaList.appendChild(row);
    }
  }
}

export function exportDidacticReport(system: SystemParams, runtime: DidacticsRuntimeState): void {
  const md = buildLessonReportMarkdown({
    courseTitle: "Exoplanet/Exomoon Guided Lab Report",
    state: runtime.learning,
    latestSignals: runtime.latestSignals,
  });
  const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `lesson-report-${system.didactics?.activeLessonId ?? "default"}.md`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function renderDidacticComparison(refs: UiRefs, text: string): void {
  if (refs.didCompareOut) refs.didCompareOut.textContent = text;
}
