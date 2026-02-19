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
  formulas?: DidacticFormulaValue[];
  checks?: DidacticCheckResult[];
  score?: number;
  allChecksPassed?: boolean;
};

export type DidacticsParams = {
  enabled?: boolean;
  activeLessonId?: string;
  autoAssess?: boolean;
  learningState?: LearningState;
};
