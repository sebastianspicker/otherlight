import type {
  DidacticResponseStore,
  DidacticSignals,
  LearningState,
  LessonEventTarget,
  LessonFocusControl,
  LessonResponseMode,
  StepTimingDiagnostics,
  SystemParams,
} from "../core/types";
import { toFiniteNumber } from "../core/units";
import {
  buildLessonReportMarkdown,
  DEFAULT_LESSON_ID,
  getLessonById,
  getLessonStepPhases,
  LESSON_EVENT_TARGET_LABELS,
  LESSON_FAMILY_LABELS,
  LESSON_FOCUS_CONTROL_LABELS,
} from "../didactics";
import type { DidacticComparison } from "../didactics/compare";
import type { UiRefs } from "../ui/refs";

type DidacticsViewRuntimeState = {
  learning: LearningState;
  responses: DidacticResponseStore;
  latestSignals?: DidacticSignals;
  latestTiming?: StepTimingDiagnostics;
  latestComparison?: DidacticComparison;
  latestComparisonText?: string;
};

function activePhase(runtime: DidacticsViewRuntimeState) {
  const lesson = getLessonById(runtime.learning.lessonId) ?? getLessonById(DEFAULT_LESSON_ID)!;
  const phases = getLessonStepPhases(lesson, runtime.learning.stepIndex);
  return phases[Math.max(0, Math.min(runtime.learning.phaseIndex ?? 0, Math.max(phases.length - 1, 0)))];
}

function currentResponseKey(runtime: DidacticsViewRuntimeState): string {
  const lesson = getLessonById(runtime.learning.lessonId) ?? getLessonById(DEFAULT_LESSON_ID)!;
  const step =
    lesson.steps[Math.max(0, Math.min(runtime.learning.stepIndex, Math.max(lesson.steps.length - 1, 0)))];
  const phase = activePhase(runtime);
  return `${lesson.id}:${step.id}:${phase?.id ?? "phase-0"}`;
}

function selectedHintLevel(refs: UiRefs): "L1" | "L2" | "L3" {
  const value = refs.didHintLevelSelect?.value;
  if (value === "L1" || value === "L2" || value === "L3") return value;
  return "L1";
}

function resolveHintsForLevel(signals: DidacticSignals | undefined, level: "L1" | "L2" | "L3"): string[] {
  if (!signals?.hintLevels) return signals?.hints ?? [];
  return level === "L1"
    ? (signals.hintLevels.L1 ?? [])
    : level === "L3"
      ? (signals.hintLevels.L3 ?? [])
      : (signals.hintLevels.L2 ?? []);
}

function resolveLessonEventSec(
  timing: StepTimingDiagnostics | undefined,
  target: LessonEventTarget | undefined,
): number | undefined {
  if (!timing || !target) return undefined;
  const lookup: Record<LessonEventTarget, number | undefined> = {
    planetIngress: timing.planetIngressSec,
    planetMidTransit: timing.planetTransitCenterSec,
    planetEgress: timing.planetEgressSec,
    moonIngress: timing.moonIngressSec,
    moonMidTransit: timing.moonTransitCenterSec,
    moonEgress: timing.moonEgressSec,
  };
  const value = lookup[target];
  return Number.isFinite(value) ? value : undefined;
}

function syncQuickControlFocusUi(refs: UiRefs, focusControls: LessonFocusControl[]): void {
  const root = refs.quickControlsRootEl;
  if (!root) return;
  const focus = new Set(focusControls);
  const cards = Array.from(root.querySelectorAll<HTMLElement>("[data-quick-control]"));
  for (const card of cards) {
    const controlId = card.dataset.quickControl as LessonFocusControl | undefined;
    const focused = controlId ? focus.has(controlId) : false;
    card.classList.toggle("quickControl--focus", focused);
    card.classList.toggle("quickControl--dimmed", focus.size > 0 && !focused);
  }
}

function responseModeForPhase(signals: DidacticSignals | undefined): LessonResponseMode {
  return signals?.responseMode ?? "none";
}

function renderResponseComposer(
  refs: UiRefs,
  runtime: DidacticsViewRuntimeState,
  signals: DidacticSignals | undefined,
): void {
  const mode = responseModeForPhase(signals);
  const response = runtime.responses[currentResponseKey(runtime)] ?? {};
  const showPrimary = mode !== "none" && mode !== "hypothesis-select";
  const showSecondary =
    (mode === "claim-reason" || mode === "explanation-notes") &&
    Boolean(signals?.responseSecondaryLabel || signals?.responseSecondaryPlaceholder);
  if (refs.didPrimaryResponseLabel) {
    refs.didPrimaryResponseLabel.textContent =
      mode === "hypothesis-select"
        ? "Use the hypothesis selector above"
        : (signals?.responsePrimaryLabel ?? "Response");
  }
  if (refs.didSecondaryResponseLabel) {
    refs.didSecondaryResponseLabel.textContent = signals?.responseSecondaryLabel ?? "Reason / evidence";
    refs.didSecondaryResponseLabel.hidden = !showSecondary;
  }
  if (refs.didPrimaryResponseInput) {
    refs.didPrimaryResponseInput.hidden = !showPrimary;
    refs.didPrimaryResponseInput.disabled = !showPrimary;
    refs.didPrimaryResponseInput.placeholder = signals?.responsePrimaryPlaceholder ?? "";
    refs.didPrimaryResponseInput.value = response.primary ?? "";
  }
  if (refs.didSecondaryResponseInput) {
    refs.didSecondaryResponseInput.hidden = !showSecondary;
    refs.didSecondaryResponseInput.disabled = !showSecondary;
    refs.didSecondaryResponseInput.placeholder = signals?.responseSecondaryPlaceholder ?? "";
    refs.didSecondaryResponseInput.value = response.secondary ?? "";
  }
  if (refs.didResponseHelp) {
    refs.didResponseHelp.textContent =
      mode === "hypothesis-select"
        ? "This phase uses the Binary Lab hypothesis selector instead of a text answer."
        : mode === "none"
          ? "This phase is for studying the worked example or reading the current feedback."
          : "Responses are stored in the lesson runtime and exported with the lesson report.";
  }
}

export function renderDidacticSignalsView(refs: UiRefs, runtime: DidacticsViewRuntimeState): void {
  const signals = runtime.latestSignals;
  const lesson = getLessonById(runtime.learning.lessonId);
  const hintLevel = selectedHintLevel(refs);
  const visibleHints = resolveHintsForLevel(signals, hintLevel);

  if (refs.didLessonStatus) {
    if (!signals) {
      refs.didLessonStatus.textContent = "Didactics disabled.";
    } else {
      const score = (toFiniteNumber(signals.score, 0) * 100).toFixed(0);
      const rubric = signals.rubricV2 ? ` · rubric ${(signals.rubricV2.score * 100).toFixed(0)}%` : "";
      const family = signals.lessonFamily ? LESSON_FAMILY_LABELS[signals.lessonFamily] : "Lesson";
      refs.didLessonStatus.textContent = `${family} · ${signals.lessonTitle ?? "Lesson"} · ${signals.stepTitle ?? ""} · ${signals.phaseTitle ?? ""} · score ${score}%${rubric}`;
    }
  }

  if (refs.didLessonSummary) {
    refs.didLessonSummary.textContent = signals
      ? `${signals.lessonSummary ?? ""} Goal: ${signals.teachingGoal ?? ""}`
      : "No active lesson summary.";
  }

  if (refs.didLessonMeta) {
    const focusText =
      signals?.focusControls && signals.focusControls.length > 0
        ? signals.focusControls.map((id) => LESSON_FOCUS_CONTROL_LABELS[id] ?? id).join(" · ")
        : "no focused quick controls";
    const vocabText =
      signals?.learnerVocabulary && signals.learnerVocabulary.length > 0
        ? signals.learnerVocabulary.join(", ")
        : "n/a";
    refs.didLessonMeta.textContent = signals
      ? `family ${signals.lessonFamily ? LESSON_FAMILY_LABELS[signals.lessonFamily] : "Lesson"} · surface ${signals.signalSurface ?? "physical"} · recommended UI ${signals.recommendedUiMode ?? "normal"} · focus ${focusText} · vocabulary ${vocabText}`
      : "";
  }

  if (refs.didPhaseTitle) {
    refs.didPhaseTitle.textContent = signals?.phaseTitle
      ? `${signals.phaseTitle} [${signals.phaseType ?? "phase"}]`
      : "No active lesson phase.";
  }

  if (refs.didPhasePrompt) {
    refs.didPhasePrompt.textContent = signals?.phasePrompt ?? signals?.prompt ?? "No active lesson prompt.";
  }

  if (refs.didInterpretation) {
    if (!signals?.interpretation) {
      refs.didInterpretation.textContent = "No didactic interpretation available yet.";
    } else {
      refs.didInterpretation.textContent = `What happened: ${signals.interpretation.headline} What it means: ${signals.interpretation.observation} Next action: ${signals.interpretation.nextAction}`;
    }
  }

  if (refs.didWorkedExample) {
    refs.didWorkedExample.replaceChildren();
    if (signals?.workedExample) {
      const title = document.createElement("strong");
      title.textContent = signals.workedExample.title;
      const body = document.createElement("div");
      body.textContent = signals.workedExample.body;
      const takeaway = document.createElement("div");
      takeaway.className = "help";
      takeaway.textContent = `Takeaway: ${signals.workedExample.takeaway}`;
      refs.didWorkedExample.append(title, body, takeaway);
      refs.didWorkedExample.hidden = false;
    } else {
      refs.didWorkedExample.hidden = true;
    }
  }

  if (refs.didObservationList) {
    refs.didObservationList.replaceChildren();
    const checklist = signals?.phaseChecklist ?? [];
    if (checklist.length === 0) {
      const row = document.createElement("div");
      row.textContent = "No observation checklist for this phase.";
      refs.didObservationList.appendChild(row);
    } else {
      for (const item of checklist) {
        const row = document.createElement("div");
        row.textContent = `Observe: ${item}`;
        refs.didObservationList.appendChild(row);
      }
    }
  }

  renderResponseComposer(refs, runtime, signals);

  if (refs.didFocusList) {
    refs.didFocusList.replaceChildren();
    const focusControls = signals?.focusControls ?? [];
    if (focusControls.length === 0) {
      const row = document.createElement("div");
      row.textContent = "Lesson focus: observe the current system and use the lesson prompts.";
      refs.didFocusList.appendChild(row);
    } else {
      for (const controlId of focusControls) {
        const row = document.createElement("div");
        row.textContent = `Focus control: ${LESSON_FOCUS_CONTROL_LABELS[controlId] ?? controlId}`;
        refs.didFocusList.appendChild(row);
      }
    }
  }

  syncQuickControlFocusUi(refs, signals?.focusControls ?? []);

  if (refs.didHintList) {
    refs.didHintList.replaceChildren();
    for (const hint of visibleHints) {
      const row = document.createElement("div");
      row.textContent = hint;
      refs.didHintList.appendChild(row);
    }
    if (visibleHints.length === 0) {
      const row = document.createElement("div");
      row.textContent = "No hints for the current lesson state.";
      refs.didHintList.appendChild(row);
    }
  }

  if (refs.didMisconceptionList) {
    refs.didMisconceptionList.replaceChildren();
    const misconceptions = signals?.misconceptions ?? [];
    if (misconceptions.length === 0) {
      const row = document.createElement("div");
      row.textContent = "No misconception flags.";
      refs.didMisconceptionList.appendChild(row);
    } else {
      for (const misconception of misconceptions) {
        const row = document.createElement("div");
        row.textContent = `[${misconception.severity}] ${misconception.message}`;
        refs.didMisconceptionList.appendChild(row);
      }
    }
  }

  if (refs.didCheckList) {
    refs.didCheckList.replaceChildren();
    const checks = signals?.checks ?? [];
    for (const c of checks) {
      const row = document.createElement("div");
      row.className = `check-item ${c.passed ? "check-pass" : "check-fail"}`;
      row.textContent = `${c.passed ? "On target" : "Still adjusting"} · ${c.statusText ?? c.label}`;
      refs.didCheckList.appendChild(row);
      const detail = document.createElement("div");
      detail.className = "help";
      detail.textContent = `Observed ${c.observed ?? "n/a"} · Expected ${c.expected ?? "n/a"}`;
      refs.didCheckList.appendChild(detail);
    }
    if (signals?.prompt) {
      const p = document.createElement("div");
      p.textContent = `Task: ${signals.prompt}`;
      refs.didCheckList.appendChild(p);
    }
  }

  if (refs.didFormulaList) {
    refs.didFormulaList.replaceChildren();
    for (const f of signals?.formulas ?? []) {
      const row = document.createElement("div");
      row.textContent = `${f.title}: ${f.latex} = ${f.value}${f.unit ? ` ${f.unit}` : ""}`;
      refs.didFormulaList.appendChild(row);
    }
  }

  if (refs.didEventTargetSelect) {
    const previousSelection = refs.didEventTargetSelect.value;
    refs.didEventTargetSelect.replaceChildren();
    const targets = signals?.phaseEventTarget
      ? [
          signals.phaseEventTarget,
          ...(signals?.eventTargets ?? lesson?.eventTargets ?? []).filter(
            (target) => target !== signals.phaseEventTarget,
          ),
        ]
      : (signals?.eventTargets ?? lesson?.eventTargets ?? []);
    if (targets.length === 0) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "No timed lesson events";
      option.disabled = true;
      option.selected = true;
      refs.didEventTargetSelect.appendChild(option);
    }
    for (const target of targets) {
      const option = document.createElement("option");
      option.value = target;
      const seconds = resolveLessonEventSec(runtime.latestTiming, target);
      option.textContent =
        seconds === undefined
          ? `${LESSON_EVENT_TARGET_LABELS[target]} (not available yet)`
          : `${LESSON_EVENT_TARGET_LABELS[target]} @ ${seconds.toFixed(0)} s`;
      option.disabled = seconds === undefined;
      refs.didEventTargetSelect.appendChild(option);
    }
    const previousOption = Array.from(refs.didEventTargetSelect.options).find(
      (option) => option.value === previousSelection && !option.disabled,
    );
    if (previousOption) {
      refs.didEventTargetSelect.value = previousOption.value;
    } else {
      const firstEnabled = Array.from(refs.didEventTargetSelect.options).find((option) => !option.disabled);
      if (firstEnabled) refs.didEventTargetSelect.value = firstEnabled.value;
    }
  }
  if (refs.didJumpEventBtn) {
    refs.didJumpEventBtn.disabled =
      !refs.didEventTargetSelect?.value ||
      resolveLessonEventSec(runtime.latestTiming, refs.didEventTargetSelect?.value as LessonEventTarget) ===
        undefined;
  }
  if (refs.didPrevBtn) {
    refs.didPrevBtn.disabled = runtime.learning.stepIndex === 0 && (runtime.learning.phaseIndex ?? 0) === 0;
  }
  if (refs.didNextBtn) {
    const activeLessonSpec = lesson ?? getLessonById(DEFAULT_LESSON_ID);
    const stepCount = activeLessonSpec?.steps.length ?? 1;
    const phases = activeLessonSpec ? getLessonStepPhases(activeLessonSpec, runtime.learning.stepIndex) : [];
    const atLastPhase = (runtime.learning.phaseIndex ?? 0) >= Math.max(phases.length - 1, 0);
    const atLastStep = runtime.learning.stepIndex >= stepCount - 1;
    refs.didNextBtn.textContent = atLastPhase ? (atLastStep ? "Restart lesson" : "Next step") : "Next phase";
  }
}

export function exportDidacticReportView(system: SystemParams, runtime: DidacticsViewRuntimeState): void {
  const md = buildLessonReportMarkdown({
    courseTitle: "Exoplanet/Exomoon Guided Lab Report",
    state: runtime.learning,
    latestSignals: runtime.latestSignals,
    responses: runtime.responses,
    latestComparison: runtime.latestComparison,
    latestComparisonText: runtime.latestComparisonText,
  });
  const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `lesson-report-${system.didactics?.activeLessonId ?? "default"}.md`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function renderDidacticComparisonView(refs: UiRefs, text: string): void {
  if (refs.didCompareOut) refs.didCompareOut.textContent = text;
}

export function resolveSelectedDidacticEventTimeView(
  runtime: DidacticsViewRuntimeState,
  refs: UiRefs,
): number | undefined {
  const target = refs.didEventTargetSelect?.value as LessonEventTarget | undefined;
  return resolveLessonEventSec(runtime.latestTiming, target);
}
