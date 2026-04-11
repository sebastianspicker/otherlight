// src/core/typesDidactics.ts
//
// Contracts for in-app learning workflows (Bachelor/Master STEM focus).

export type DidacticFormulaValue = {
  id: string;
  title: string;
  latex: string;
  value: number;
  unit?: string;
};

export type LessonSimMode = "preset-lab" | "binary-lab" | "either";
export type LessonRecommendedUiMode = "normal" | "expert";
export type LessonSignalSurface = "physical";
export type LessonFamily =
  | "transit-geometry"
  | "exomoon-signal"
  | "binary-inference"
  | "curve-reading"
  | "stellar-surface"
  | "dynamical-inference";
export type LessonFocusControl =
  | "quickPlanetR"
  | "quickPlanetInc"
  | "quickPlanetA"
  | "quickMoonEnabled"
  | "quickMoonR"
  | "quickMoonA"
  | "quickMoonInc"
  | "quickReflectedLight";
export type LessonEventTarget =
  | "planetIngress"
  | "planetMidTransit"
  | "planetEgress"
  | "moonIngress"
  | "moonMidTransit"
  | "moonEgress";
export type LessonPhaseType = "worked-example" | "predict" | "observe" | "explain" | "compare" | "report";
export type LessonResponseMode =
  | "none"
  | "claim-reason"
  | "observation-notes"
  | "explanation-notes"
  | "comparison-notes"
  | "reflection-notes"
  | "hypothesis-select";

export type LessonWorkedExample = {
  title: string;
  body: string;
  takeaway: string;
};

export type LessonPhaseSpec = {
  id: string;
  type: LessonPhaseType;
  title: string;
  prompt: string;
  eventTarget?: LessonEventTarget;
  checklist?: string[];
  responseMode?: LessonResponseMode;
  primaryLabel?: string;
  secondaryLabel?: string;
  primaryPlaceholder?: string;
  secondaryPlaceholder?: string;
  workedExample?: LessonWorkedExample;
};

export type AssessmentRule =
  | {
      id: string;
      label: string;
      kind: "range";
      signal:
        | "bPlanet"
        | "bMoon"
        | "fluxTransitFactor"
        | "tdvRatio"
        | "rvStar"
        | "rvPlanet"
        | "depthObserved"
        | "combinedFluxDrop";
      min?: number;
      max?: number;
    }
  | {
      id: string;
      label: string;
      kind: "approx";
      signal: "depthApprox" | "depthObserved" | "tdvRatio" | "combinedFluxDrop";
      target: number;
      tolerance: number;
    }
  | {
      id: string;
      label: string;
      kind: "distance";
      signal: "tdvRatio" | "moonLeadLagSec";
      target: number;
      minAbsDelta: number;
    }
  | {
      id: string;
      label: string;
      kind: "signal-approx";
      signal: "depthObserved" | "depthApprox" | "tdvRatio" | "combinedFluxDrop";
      referenceSignal: "depthApprox" | "depthObserved";
      tolerance: number;
    };

/** Union of all AssessmentRule `kind` discriminants. Useful for exhaustive switch statements. */
export type AssessmentRuleKind = AssessmentRule["kind"];

export type LessonStep = {
  id: string;
  title: string;
  prompt: string;
  checks: AssessmentRule[];
  phases?: LessonPhaseSpec[];
};

export type LessonSpec = {
  id: string;
  title: string;
  summary: string;
  audience: "bachelor-master-stem";
  family: LessonFamily;
  simMode: LessonSimMode;
  recommendedUiMode: LessonRecommendedUiMode;
  signalSurface: LessonSignalSurface;
  teachingGoal: string;
  focusControls: LessonFocusControl[];
  eventTargets: LessonEventTarget[];
  learnerVocabulary: string[];
  comparisonPrompt: string;
  steps: LessonStep[];
};

export type LearningState = {
  lessonId: string;
  stepIndex: number;
  phaseIndex?: number;
  passedStepIds: readonly string[];
  lastScore?: number;
  updatedAtSec?: number;
};

export type DidacticResponseEntry = {
  primary?: string;
  secondary?: string;
  updatedAtSec?: number;
};

export type DidacticResponseStore = Record<string, DidacticResponseEntry>;

export type DidacticCheckResult = {
  id: string;
  label: string;
  passed: boolean;
  observed?: number;
  expected?: string;
  statusText?: string;
};

export type DidacticInterpretation = {
  headline: string;
  observation: string;
  nextAction: string;
};

export type DidacticSignals = {
  lessonId?: string;
  lessonTitle?: string;
  lessonFamily?: LessonFamily;
  lessonSummary?: string;
  teachingGoal?: string;
  signalSurface?: LessonSignalSurface;
  recommendedUiMode?: LessonRecommendedUiMode;
  focusControls?: LessonFocusControl[];
  eventTargets?: LessonEventTarget[];
  learnerVocabulary?: string[];
  comparisonPrompt?: string;
  stepId?: string;
  stepTitle?: string;
  phaseId?: string;
  phaseType?: LessonPhaseType;
  phaseTitle?: string;
  phasePrompt?: string;
  phaseChecklist?: string[];
  phaseEventTarget?: LessonEventTarget;
  responseMode?: LessonResponseMode;
  responsePrimaryLabel?: string;
  responseSecondaryLabel?: string;
  responsePrimaryPlaceholder?: string;
  responseSecondaryPlaceholder?: string;
  workedExample?: LessonWorkedExample;
  prompt?: string;
  hints?: string[];
  hintLevels?: {
    L1?: string[];
    L2?: string[];
    L3?: string[];
  };
  misconceptions?: Array<{
    id: string;
    message: string;
    severity: "info" | "warn";
  }>;
  formulas?: DidacticFormulaValue[];
  checks?: DidacticCheckResult[];
  interpretation?: DidacticInterpretation;
  rubricV2?: {
    score: number;
    pass: boolean;
    passScore: number;
    breakdown: Array<{
      id: string;
      label: string;
      weight: number;
      score: number;
    }>;
  };
  score?: number;
  allChecksPassed?: boolean;
};

export type RubricCriterionV2 = {
  id: string;
  label: string;
  weight: number;
  metric: "check-pass-rate" | "depth-consistency" | "timing-signal";
};

export type AssessmentRubricV2 = {
  enabled?: boolean;
  passScore?: number;
  criteria?: RubricCriterionV2[];
};

export type DidacticsParams = {
  enabled?: boolean;
  activeLessonId?: string;
  autoAssess?: boolean;
  hintLevel?: "L1" | "L2" | "L3";
  misconceptionChecks?: {
    enabled?: boolean;
  };
  compareLabs?: {
    enabled?: boolean;
    autoInterpret?: boolean;
  };
  assessmentRubricV2?: AssessmentRubricV2;
  learningState?: LearningState;
};
