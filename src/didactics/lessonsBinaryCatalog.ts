import type { LessonSpec } from "../core/types";
import {
  BINARY_EXAMPLE,
  comparePhase,
  explainPhase,
  observePhase,
  reportPhase,
  workedExamplePhase,
} from "./lessonPhases";

export const BINARY_LESSONS: LessonSpec[] = [
  {
    id: "binary-eclipse-lab",
    title: "Binary Eclipse Lab",
    summary:
      "Use the detached binary as a black-box eclipse system: read the combined flux first, then connect eclipse depth and chord geometry to the revealed sky view.",
    audience: "bachelor-master-stem",
    family: "binary-inference",
    simMode: "binary-lab",
    recommendedUiMode: "normal",
    signalSurface: "physical",
    teachingGoal:
      "Teach that two luminous bodies can still produce interpretable eclipse depths and that the sky-plane chord controls whether eclipses are deep or grazing.",
    focusControls: [],
    eventTargets: ["planetIngress", "planetMidTransit", "planetEgress"],
    learnerVocabulary: ["primary eclipse", "secondary eclipse", "combined baseline", "grazing eclipse"],
    comparisonPrompt:
      "Compare the hidden-system hypothesis to the revealed sky view: did the deeper eclipse come from geometry, luminosity ratio, or both?",
    steps: [
      {
        id: "binary-step-1",
        title: "Infer the hidden binary from the combined curve",
        prompt:
          "Keep the sky hidden first. Use the curve to form a hypothesis about which eclipse is deeper and what that implies about the two stars.",
        checks: [
          {
            id: "binary-drop",
            label: "combined eclipse depth > 1%",
            kind: "range",
            signal: "combinedFluxDrop",
            min: 0.01,
          },
        ],
        phases: [
          workedExamplePhase(
            "binary-step-1-example",
            "Study the black-box worked example before making your own binary inference.",
            BINARY_EXAMPLE,
          ),
          {
            id: "binary-step-1-predict",
            type: "predict",
            title: "Choose a binary hypothesis",
            prompt:
              "Use the hypothesis selector to commit to your interpretation of the hidden binary before revealing the sky.",
            responseMode: "hypothesis-select",
            primaryLabel: "Binary hypothesis",
          },
          observePhase({
            id: "binary-step-1-observe",
            title: "Observe the combined-light eclipse",
            prompt:
              "Stay in black-box mode first. Record what the combined curve alone tells you about eclipse depth and shape.",
            eventTarget: "planetMidTransit",
            checklist: [
              "Is the combined flux drop deep enough to read cleanly?",
              "Does the curve suggest a central or grazing eclipse?",
              "What can you infer before seeing the sky?",
            ],
            primaryLabel: "Black-box observation",
          }),
          explainPhase({
            id: "binary-step-1-explain",
            title: "Explain your hidden-system model",
            prompt: "Explain what your chosen hypothesis means physically before you reveal the sky.",
            primaryLabel: "Model before reveal",
            secondaryLabel: "Which evidence on the curve supports it?",
          }),
          reportPhase({
            id: "binary-step-1-report",
            title: "Commit the pre-reveal claim",
            prompt: "State your pre-reveal claim so you can compare it against the revealed system later.",
          }),
        ],
      },
      {
        id: "binary-step-2",
        title: "Reveal the sky and revise the model",
        prompt:
          "Reveal the sky, compare it against your pre-reveal claim, and decide whether geometry, luminosity ratio, or both explain the deeper eclipse.",
        checks: [{ id: "binary-b-low", label: "b < 0.4", kind: "range", signal: "bPlanet", max: 0.4 }],
        phases: [
          observePhase({
            id: "binary-step-2-observe",
            title: "Observe the revealed geometry",
            prompt:
              "Reveal the sky and record what the eclipse chord and luminous-body ordering actually look like.",
            eventTarget: "planetMidTransit",
            checklist: [
              "Is the occulting chord central or grazing?",
              "Which star is being eclipsed at the selected event?",
              "Does the revealed geometry support your earlier claim?",
            ],
            primaryLabel: "Post-reveal observation",
          }),
          explainPhase({
            id: "binary-step-2-explain",
            title: "Revise the binary explanation",
            prompt:
              "Explain what the reveal changed in your model and whether the deeper eclipse comes from geometry, brightness contrast, or both.",
            primaryLabel: "Revised explanation",
            secondaryLabel: "What changed in your model after reveal?",
          }),
          comparePhase({
            id: "binary-step-2-compare",
            title: "Compare prediction and reveal",
            prompt:
              "Compare your pre-reveal claim to the revealed geometry and state the strongest piece of evidence that confirmed or falsified it.",
            primaryLabel: "Prediction vs reveal",
          }),
          reportPhase({
            id: "binary-step-2-report",
            title: "Finalize the binary inference",
            prompt:
              "Write a final binary-lab conclusion that links the combined light curve to the revealed two-star geometry.",
          }),
        ],
      },
    ],
  },
];
