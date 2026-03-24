# Didactics Curriculum V3

Curriculum V3 extends the legacy lesson/check model with rubrics, adaptive hints, and progress persistence.

## Core Types

- `DidacticCurriculumV3`
- `LessonStepV3` (supports `dependsOnStepIds`)
- `AssessmentRubricV3` (weighted criteria)
- `HintPolicyV3`
- `LearningProgressV3`

## Runtime Behavior

1. Runtime receives `didactics.curriculum[]` and `didactics.curriculumId`.
2. The active step is selected from `LearningProgressV3.stepIndex`.
3. Rubric score is computed from weighted criteria/check pass state.
4. Adaptive hints are generated from failed checks and hint policy.
5. `nextLearningProgress` is computed deterministically (dependency-gated).

## Persistence

Progress persistence helpers:

- `saveLearningProgressV3(...)`
- `loadLearningProgressV3(...)`
- `clearLearningProgressV3(...)`

Persistence is schema-versioned to avoid incompatible resume states.

## Design Goals

- Deterministic progression behavior for reproducible lab sessions.
- Explainability-first hint strategy aligned with physical model concepts.
- Separation of curriculum intent from low-level UI control wiring.
