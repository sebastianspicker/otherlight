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

export type AssessmentRule =
  | {
      id: string;
      label: string;
      kind: "range";
      signal: "bPlanet" | "fluxTransitFactor" | "tdvRatio" | "rvStar" | "rvPlanet" | "depthObserved";
      min?: number;
      max?: number;
    }
  | {
      id: string;
      label: string;
      kind: "approx";
      signal: "depthApprox" | "depthObserved" | "tdvRatio";
      target: number;
      tolerance: number;
    }
  | {
      id: string;
      label: string;
      kind: "distance";
      signal: "tdvRatio";
      target: number;
      minAbsDelta: number;
    };

export type LessonStep = {
  id: string;
  title: string;
  prompt: string;
  checks: AssessmentRule[];
};

export type LessonSpec = {
  id: string;
  title: string;
  summary: string;
  audience: "bachelor-master-stem";
  steps: LessonStep[];
};

export type LearningState = {
  lessonId: string;
  stepIndex: number;
  passedStepIds: string[];
  lastScore?: number;
  updatedAtSec?: number;
};

export type DidacticCheckResult = {
  id: string;
  label: string;
  passed: boolean;
  observed?: number;
  expected?: string;
};

export type DidacticSignals = {
  lessonId?: string;
  lessonTitle?: string;
  stepId?: string;
  stepTitle?: string;
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
