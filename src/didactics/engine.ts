import type { DidacticSignals, LearningState, StepResult, SystemParams } from "../core/types";
import { toFiniteNumber } from "../core/units";
import { DEFAULT_LESSON_ID, getLessonById } from "./lessons";
import {
  buildHintLevels,
  buildInterpretation,
  buildMisconceptions,
  collectNumericSignals,
  currentStepPhases,
  evaluateChecks,
  evaluateRubricV2,
} from "./engineSupport";
import { resolveLearningState } from "./learningState";

type HintLevels = { L1: string[]; L2: string[]; L3: string[] };
type FormulaCards = NonNullable<DidacticSignals["formulas"]>;
type ActiveLesson = NonNullable<ReturnType<typeof getLessonById>>;

export { resolveLearningState } from "./learningState";

function selectedHints(hintLevels: HintLevels, preferredLevel: "L1" | "L2" | "L3"): string[] {
  if (preferredLevel === "L1") return hintLevels.L1;
  if (preferredLevel === "L3") return hintLevels.L3;
  return hintLevels.L2;
}

function baseHints(bPlanetFinite: boolean, checksFailed: boolean): string[] {
  const hints: string[] = [];
  if (!bPlanetFinite) {
    hints.push("Impact parameter is undefined; check observer direction and orbit geometry.");
  }
  if (checksFailed) {
    hints.push("Adjust one control at a time, then compare physical vs measured plot mode.");
  }
  return hints;
}

function misconceptionSignals(
  system: SystemParams,
  bPlanetFinite: boolean,
  numeric: ReturnType<typeof collectNumericSignals>,
): DidacticSignals["misconceptions"] {
  return system.didactics?.misconceptionChecks?.enabled !== false
    ? buildMisconceptions({
        bPlanetFinite,
        depthApprox: numeric.depthApprox,
        depthObserved: numeric.depthObserved,
      })
    : [];
}

function currentPhase(
  lesson: ActiveLesson,
  state: LearningState,
): ReturnType<typeof currentStepPhases>[number] | undefined {
  const phases = currentStepPhases(lesson, state.stepIndex);
  const maxPhaseIndex = Math.max(phases.length - 1, 0);
  return phases[Math.max(0, Math.min(state.phaseIndex ?? 0, maxPhaseIndex))];
}

function formulaCards(lessonId: string, numeric: ReturnType<typeof collectNumericSignals>): FormulaCards {
  return [
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
    ...moonFormulaCards(numeric),
    ...binaryFormulaCards(lessonId, numeric),
  ];
}

function moonFormulaCards(numeric: ReturnType<typeof collectNumericSignals>): FormulaCards {
  const formulas: FormulaCards = [];
  if (Number.isFinite(numeric.bMoon)) {
    formulas.push({
      id: "moon-impact-parameter",
      title: "Moon impact parameter proxy",
      latex: "b_m \\approx \\frac{\\sqrt{x_m^2 + y_m^2}}{R_*}",
      value: numeric.bMoon,
      unit: "1",
    });
  }
  if (Number.isFinite(numeric.moonLeadLagSec)) {
    formulas.push({
      id: "moon-lead-lag",
      title: "Moon lead/lag relative to planet",
      latex: "\\Delta t_{m-p} = t_{m,center} - t_{p,center}",
      value: numeric.moonLeadLagSec,
      unit: "s",
    });
  }
  return formulas;
}

function binaryFormulaCards(
  lessonId: string,
  numeric: ReturnType<typeof collectNumericSignals>,
): FormulaCards {
  if (lessonId !== "binary-eclipse-lab") return [];
  return [
    {
      id: "combined-flux-drop",
      title: "Combined binary eclipse depth",
      latex: "\\delta_{\\mathrm{combined}} = 1 - \\frac{F_{\\mathrm{total}}}{F_{\\mathrm{baseline}}}",
      value: numeric.combinedFluxDrop,
      unit: "1",
    },
  ];
}

export function computeDidacticSignals(system: SystemParams, step: StepResult): DidacticSignals | undefined {
  if (!system.didactics?.enabled) return undefined;

  const lesson =
    getLessonById(system.didactics.activeLessonId ?? DEFAULT_LESSON_ID) ?? getLessonById(DEFAULT_LESSON_ID)!;
  const state = resolveLearningState(system, toFiniteNumber(step.meta?.t, 0));
  const numeric = collectNumericSignals(system, step);
  const evalResult = evaluateChecks(lesson, state.stepIndex, numeric);
  const phase = currentPhase(lesson, state);
  const bPlanetFinite = Number.isFinite(numeric.bPlanet);
  const checksFailed = !evalResult.allChecksPassed;
  const hintLevels = buildHintLevels({
    checksFailed,
    bPlanetFinite,
    depthApprox: numeric.depthApprox,
    depthObserved: numeric.depthObserved,
  });
  const preferredLevel = system.didactics.hintLevel ?? "L2";
  const hints = [...baseHints(bPlanetFinite, checksFailed), ...selectedHints(hintLevels, preferredLevel)];
  const misconceptions = misconceptionSignals(system, bPlanetFinite, numeric);
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
    hints,
    hintLevels,
    misconceptions,
    interpretation,
    rubricV2,
    score: evalResult.score,
    allChecksPassed: evalResult.allChecksPassed,
    checks: evalResult.checks,
    formulas: formulaCards(lesson.id, numeric),
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
