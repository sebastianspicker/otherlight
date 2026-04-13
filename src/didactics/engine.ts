import type { DidacticSignals, LearningState, StepResult, SystemParams } from "../core/types";
import { toFiniteNumber } from "../core/units";
import { DEFAULT_LESSON_ID, getLessonById } from "./lessons";
import {
  buildHintLevels,
  buildInterpretation,
  buildMisconceptions,
  clampIndex,
  collectNumericSignals,
  currentStepPhases,
  evaluateChecks,
  evaluateRubricV2,
} from "./engineSupport";

export function resolveLearningState(system: SystemParams, tSec: number): LearningState {
  const did = system.didactics;
  const lesson = getLessonById(did?.activeLessonId ?? DEFAULT_LESSON_ID);
  const prev = did?.learningState;
  if (!lesson) {
    // Unknown lesson ID: preserve previous state unchanged to avoid silent reset every frame.
    if (prev) return { ...prev };
    return {
      lessonId: DEFAULT_LESSON_ID,
      stepIndex: 0,
      phaseIndex: 0,
      passedStepIds: [],
      updatedAtSec: tSec,
    };
  }
  if (!prev || prev.lessonId !== lesson.id) {
    return {
      lessonId: lesson.id,
      stepIndex: 0,
      phaseIndex: 0,
      passedStepIds: [],
      updatedAtSec: tSec,
    };
  }
  const maxStepIndex = Math.max(lesson.steps.length - 1, 0);
  const safeStepIndex = clampIndex(prev.stepIndex, maxStepIndex);
  const phases = currentStepPhases(lesson, safeStepIndex);
  const safePhaseIndex = clampIndex(prev.phaseIndex ?? 0, Math.max(phases.length - 1, 0));
  const passedStepIds = Array.isArray(prev.passedStepIds) ? prev.passedStepIds : [];
  const prevPhaseIndex = prev.phaseIndex ?? 0;

  if (
    prev.stepIndex === safeStepIndex &&
    prevPhaseIndex === safePhaseIndex &&
    Array.isArray(prev.passedStepIds)
  ) {
    return prev;
  }

  return {
    lessonId: prev.lessonId,
    stepIndex: safeStepIndex,
    phaseIndex: safePhaseIndex,
    passedStepIds,
    lastScore: prev.lastScore,
    updatedAtSec: prev.updatedAtSec,
  };
}

export function computeDidacticSignals(system: SystemParams, step: StepResult): DidacticSignals | undefined {
  if (!system.didactics?.enabled) return undefined;

  const lesson =
    getLessonById(system.didactics.activeLessonId ?? DEFAULT_LESSON_ID) ?? getLessonById(DEFAULT_LESSON_ID)!;
  const state = resolveLearningState(system, toFiniteNumber(step.meta?.t, 0));
  const numeric = collectNumericSignals(system, step);
  const evalResult = evaluateChecks(lesson, state.stepIndex, numeric);
  const phases = currentStepPhases(lesson, state.stepIndex);
  const phase = phases[Math.max(0, Math.min(state.phaseIndex ?? 0, Math.max(phases.length - 1, 0)))];
  const bPlanetFinite = Number.isFinite(numeric.bPlanet);
  const checksFailed = !evalResult.allChecksPassed;
  const baseHints: string[] = [];

  if (!bPlanetFinite) {
    baseHints.push("Impact parameter is undefined; check observer direction and orbit geometry.");
  }
  if (checksFailed) {
    baseHints.push("Adjust one control at a time, then compare physical vs measured plot mode.");
  }

  const hintLevels = buildHintLevels({
    checksFailed,
    bPlanetFinite,
    depthApprox: numeric.depthApprox,
    depthObserved: numeric.depthObserved,
  });
  const preferredLevel = system.didactics.hintLevel ?? "L2";
  const selectedHints =
    preferredLevel === "L1" ? hintLevels.L1 : preferredLevel === "L3" ? hintLevels.L3 : hintLevels.L2;
  const misconceptions =
    system.didactics.misconceptionChecks?.enabled !== false
      ? buildMisconceptions({
          bPlanetFinite,
          depthApprox: numeric.depthApprox,
          depthObserved: numeric.depthObserved,
        })
      : [];
  const rubricV2 = evaluateRubricV2({
    rubric: system.didactics.assessmentRubricV2,
    checksScore: evalResult.score,
    depthApprox: numeric.depthApprox,
    depthObserved: numeric.depthObserved,
    tdvRatio: numeric.tdvRatio,
  });
  const interpretation = buildInterpretation(lesson, evalResult, numeric);

  return {
    lessonId: lesson.id,
    lessonTitle: lesson.title,
    lessonFamily: lesson.family,
    lessonSummary: lesson.summary,
    teachingGoal: lesson.teachingGoal,
    signalSurface: lesson.signalSurface,
    recommendedUiMode: lesson.recommendedUiMode,
    focusControls: lesson.focusControls,
    eventTargets: lesson.eventTargets,
    learnerVocabulary: lesson.learnerVocabulary,
    comparisonPrompt: lesson.comparisonPrompt,
    stepId: evalResult.stepId,
    stepTitle: evalResult.stepTitle,
    phaseId: phase?.id,
    phaseType: phase?.type,
    phaseTitle: phase?.title,
    phasePrompt: phase?.prompt,
    phaseChecklist: phase?.checklist,
    phaseEventTarget: phase?.eventTarget,
    responseMode: phase?.responseMode,
    responsePrimaryLabel: phase?.primaryLabel,
    responseSecondaryLabel: phase?.secondaryLabel,
    responsePrimaryPlaceholder: phase?.primaryPlaceholder,
    responseSecondaryPlaceholder: phase?.secondaryPlaceholder,
    workedExample: phase?.workedExample,
    prompt: evalResult.prompt,
    hints: [...baseHints, ...selectedHints],
    hintLevels,
    misconceptions,
    interpretation,
    rubricV2,
    score: evalResult.score,
    allChecksPassed: evalResult.allChecksPassed,
    checks: evalResult.checks,
    formulas: [
      {
        id: "depth-approx",
        title: "Geometric depth approximation",
        latex: "\\delta_{\\mathrm{geom}} \\approx \\left(\\frac{R_p}{R_*}\\right)^2",
        value: numeric.depthApprox,
        unit: "1",
      },
      {
        id: "depth-observed",
        title: "Physical transit depth",
        latex: "\\delta_{\\mathrm{physical}} = 1 - F_{\\mathrm{transit}}",
        value: numeric.depthObserved,
        unit: "1",
      },
      {
        id: "impact-parameter",
        title: "Impact parameter proxy",
        latex: "b \\approx \\frac{\\sqrt{x^2 + y^2}}{R_*}",
        value: numeric.bPlanet,
        unit: "1",
      },
      ...(Number.isFinite(numeric.bMoon)
        ? [
            {
              id: "moon-impact-parameter",
              title: "Moon impact parameter proxy",
              latex: "b_m \\approx \\frac{\\sqrt{x_m^2 + y_m^2}}{R_*}",
              value: numeric.bMoon,
              unit: "1",
            },
          ]
        : []),
      ...(Number.isFinite(numeric.moonLeadLagSec)
        ? [
            {
              id: "moon-lead-lag",
              title: "Moon lead/lag relative to planet",
              latex: "\\Delta t_{m-p} = t_{m,center} - t_{p,center}",
              value: numeric.moonLeadLagSec,
              unit: "s",
            },
          ]
        : []),
      ...(lesson.id === "binary-eclipse-lab"
        ? [
            {
              id: "combined-flux-drop",
              title: "Combined binary eclipse depth",
              latex: "\\delta_{\\mathrm{combined}} = 1 - \\frac{F_{\\mathrm{total}}}{F_{\\mathrm{baseline}}}",
              value: numeric.combinedFluxDrop,
              unit: "1",
            },
          ]
        : []),
    ],
  };
}

export function advanceLearningState(
  state: LearningState,
  didacticSignals: DidacticSignals | undefined,
  _autoAdvance: boolean,
  tSec: number,
): LearningState {
  if (!didacticSignals) return state;
  const next = {
    ...state,
    lastScore: didacticSignals.score,
    updatedAtSec: tSec,
  };
  const stepId = didacticSignals.stepId;
  if (didacticSignals.allChecksPassed && stepId && !next.passedStepIds.includes(stepId)) {
    next.passedStepIds = [...next.passedStepIds, stepId];
  }
  return next;
}
