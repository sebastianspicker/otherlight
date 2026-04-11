import type {
  LessonEventTarget,
  LessonFamily,
  LessonFocusControl,
  LessonPhaseSpec,
  LessonSimMode,
  LessonSpec,
} from "../core/types";
import {
  BINARY_EXAMPLE,
  CURVE_READING_EXAMPLE,
  EXOMOON_EXAMPLE,
  TRANSIT_GEOMETRY_EXAMPLE,
  comparePhase,
  explainPhase,
  observePhase,
  predictPhase,
  reportPhase,
  workedExamplePhase,
} from "./lessonPhases";

export const LESSON_FOCUS_CONTROL_LABELS: Record<LessonFocusControl, string> = {
  quickPlanetR: "Planet size",
  quickPlanetInc: "Planet inclination",
  quickPlanetA: "Planet orbit size",
  quickMoonEnabled: "Show moon",
  quickMoonR: "Moon size",
  quickMoonA: "Moon spacing",
  quickMoonInc: "Moon inclination",
  quickReflectedLight: "Show reflected light",
};

export const LESSON_EVENT_TARGET_LABELS: Record<LessonEventTarget, string> = {
  planetIngress: "Planet ingress",
  planetMidTransit: "Planet mid-transit",
  planetEgress: "Planet egress",
  moonIngress: "Moon ingress",
  moonMidTransit: "Moon mid-transit",
  moonEgress: "Moon egress",
};

export const LESSON_FAMILY_LABELS: Record<LessonFamily, string> = {
  "transit-geometry": "Transit Geometry",
  "exomoon-signal": "Exomoon Signal",
  "binary-inference": "Binary Inference",
  "curve-reading": "Reading the Curve",
  "stellar-surface": "Stellar Surface",
  "dynamical-inference": "Dynamical Inference",
};

export const LESSONS: LessonSpec[] = [
  {
    id: "kepler-geometry",
    title: "Kepler Transit Geometry",
    summary:
      "Explore the relationship between orbital inclination, impact parameter b, and transit depth delta = (Rp/R*)^2 for a planet-only system.",
    audience: "bachelor-master-stem",
    family: "transit-geometry",
    simMode: "preset-lab",
    recommendedUiMode: "normal",
    signalSurface: "physical",
    teachingGoal: "Connect observer-facing geometry to where the transit chord falls on the stellar disk.",
    focusControls: ["quickPlanetInc", "quickPlanetR", "quickPlanetA"],
    eventTargets: ["planetIngress", "planetMidTransit", "planetEgress"],
    learnerVocabulary: ["transit chord", "impact parameter", "central transit", "depth"],
    comparisonPrompt:
      "Use A/B compare after changing only planet inclination or size so you can separate geometry effects from depth effects.",
    steps: [
      {
        id: "kepler-step-1",
        title: "Achieve a near-central transit",
        prompt:
          "Adjust the orbital inclination i so that the projected impact parameter b stays below 0.2. Recall that b = (a cos i) / R* for a circular orbit.",
        checks: [{ id: "b-low", label: "b < 0.2", kind: "range", signal: "bPlanet", max: 0.2 }],
        phases: [
          workedExamplePhase(
            "kepler-step-1-example",
            "Study the solved example first so you know what kind of geometry you are trying to reproduce.",
            TRANSIT_GEOMETRY_EXAMPLE,
          ),
          predictPhase({
            id: "kepler-step-1-predict",
            title: "Predict the chord",
            prompt: "Predict what will happen to the transit chord if you increase the planet inclination.",
            primaryLabel: "Prediction",
            secondaryLabel: "Why?",
            primaryPlaceholder: "Example: The chord should move closer to the stellar center.",
            secondaryPlaceholder: "Explain using the observer-facing geometry, not only intuition.",
          }),
          observePhase({
            id: "kepler-step-1-observe",
            title: "Observe ingress and mid-transit",
            prompt:
              "Jump to ingress and then mid-transit. Record how the chord sits on the stellar disk and whether the planet is truly in front of the star.",
            eventTarget: "planetMidTransit",
            checklist: [
              "Does the projected planet path cross the stellar disk?",
              "Is the planet in front of the star from the observer's view?",
              "Is the chord central or grazing?",
            ],
          }),
          explainPhase({
            id: "kepler-step-1-explain",
            title: "Explain the geometry",
            prompt:
              "Explain whether the visual geometry supports your prediction and how the impact parameter expresses that geometry.",
          }),
          comparePhase({
            id: "kepler-step-1-compare",
            title: "Isolate the geometry effect",
            prompt:
              "Use A/B compare after changing only inclination and state exactly what changed on the curve because of geometry.",
          }),
          reportPhase({
            id: "kepler-step-1-report",
            title: "State the rule",
            prompt:
              "Summarize the rule that connects inclination, projected chord position, and impact parameter.",
          }),
        ],
      },
      {
        id: "kepler-step-2",
        title: "Verify the geometric depth approximation",
        prompt:
          "For a uniform stellar disk and a near-central transit, the depth should satisfy delta_physical ~ (Rp/R*)^2. Check that the physical transit depth matches this prediction within 20%.",
        checks: [
          {
            id: "depth-approx",
            label: "delta_physical ~ (Rp/R*)^2  (within 20%)",
            kind: "signal-approx",
            signal: "depthObserved",
            referenceSignal: "depthApprox",
            tolerance: 0.2,
          },
        ],
        phases: [
          predictPhase({
            id: "kepler-step-2-predict",
            title: "Predict the depth match",
            prompt:
              "Predict whether the physical transit depth should match the simple radius-ratio estimate in this geometry.",
            primaryLabel: "Prediction",
            secondaryLabel: "Why?",
          }),
          observePhase({
            id: "kepler-step-2-observe",
            title: "Read the depth at mid-transit",
            prompt:
              "Use the physical curve at mid-transit and note whether the depth matches your geometric expectation.",
            eventTarget: "planetMidTransit",
            checklist: [
              "Is the strongest attenuation happening at mid-transit?",
              "Does the planet still cross near the stellar center?",
              "Does the curve depth look consistent with the planet size?",
            ],
          }),
          explainPhase({
            id: "kepler-step-2-explain",
            title: "Explain the depth",
            prompt:
              "Explain whether the depth agrees with the geometric estimate and what would break that agreement.",
          }),
          reportPhase({
            id: "kepler-step-2-report",
            title: "Finalize the lesson claim",
            prompt:
              "Write one compact rule for when (Rp/R*)^2 is a good approximation and when it stops being reliable.",
          }),
        ],
      },
    ],
  },
  {
    id: "curve-reading-lab",
    title: "Curve Reading Lab",
    summary:
      "Learn to read ingress, mid-transit, and egress as named events so the canvas and the light curve become one coherent observer-facing story.",
    audience: "bachelor-master-stem",
    family: "curve-reading",
    simMode: "preset-lab",
    recommendedUiMode: "normal",
    signalSurface: "physical",
    teachingGoal:
      "Train disciplined observation: what is visible, what is in front, and how named curve landmarks map to the sky-plane view.",
    focusControls: ["quickPlanetInc", "quickPlanetR"],
    eventTargets: ["planetIngress", "planetMidTransit", "planetEgress"],
    learnerVocabulary: ["ingress", "mid-transit", "egress", "front-of-star", "recovery"],
    comparisonPrompt:
      "Compare the system at ingress and at mid-transit to isolate what changes first on the curve and in the projected overlap.",
    steps: [
      {
        id: "curve-reading-step-1",
        title: "Identify the three landmarks",
        prompt:
          "Use the event jumps to observe ingress, mid-transit, and egress and connect each one to the curve shape.",
        checks: [
          {
            id: "curve-reading-active",
            label: "physical transit depth > 0",
            kind: "range",
            signal: "depthObserved",
            min: 1e-6,
          },
        ],
        phases: [
          workedExamplePhase(
            "curve-reading-step-1-example",
            "Read the worked example before you start naming the landmarks yourself.",
            CURVE_READING_EXAMPLE,
          ),
          predictPhase({
            id: "curve-reading-step-1-predict",
            title: "Predict the landmark order",
            prompt:
              "Predict what each event should look like on the curve and on the sky plane before you jump to it.",
            primaryLabel: "Predicted sequence",
            secondaryLabel: "How will you recognize each event?",
          }),
          observePhase({
            id: "curve-reading-step-1-observe",
            title: "Observe the landmarks",
            prompt: "Jump between ingress, mid-transit, and egress and record what you actually observe.",
            eventTarget: "planetIngress",
            checklist: [
              "Where does the curve first leave baseline?",
              "At which event is overlap strongest?",
              "When does the curve begin to recover?",
            ],
          }),
          explainPhase({
            id: "curve-reading-step-1-explain",
            title: "Explain the event mapping",
            prompt:
              "Explain why those three named landmarks occur in that order and how the canvas confirms them.",
          }),
          reportPhase({
            id: "curve-reading-step-1-report",
            title: "State the reading rule",
            prompt:
              "Write a short observer-facing rule for how to identify ingress, mid-transit, and egress.",
          }),
        ],
      },
    ],
  },
  {
    id: "exomoon-transit-lab",
    title: "Exomoon Transit Lab",
    summary:
      "Separate the moon signature from the planet signal by controlling the moon's size, spacing, and inclination in a viewer-aligned transit geometry.",
    audience: "bachelor-master-stem",
    family: "exomoon-signal",
    simMode: "preset-lab",
    recommendedUiMode: "normal",
    signalSurface: "physical",
    teachingGoal:
      "Show that a moon signature depends on front-of-star geometry and on whether the moon is temporally separated from the planet dip.",
    focusControls: ["quickMoonEnabled", "quickMoonR", "quickMoonA", "quickMoonInc", "quickPlanetInc"],
    eventTargets: ["planetMidTransit", "moonIngress", "moonMidTransit", "moonEgress", "planetEgress"],
    learnerVocabulary: ["lead/lag", "moon dip", "tilted moon orbit", "separated signal"],
    comparisonPrompt:
      "Compare a moon-on and moon-off configuration at the same time to isolate which feature belongs to the moon rather than the planet.",
    steps: [
      {
        id: "exomoon-step-1",
        title: "Bring the moon into front-of-star geometry",
        prompt:
          "Adjust the moon inclination so that the moon can actually cross the stellar disk. You are looking for a finite, front-of-star moon impact parameter.",
        checks: [{ id: "b-moon-low", label: "b_moon < 1.1", kind: "range", signal: "bMoon", max: 1.1 }],
        phases: [
          workedExamplePhase(
            "exomoon-step-1-example",
            "Study the worked example so you know what kind of moon geometry is required before a moon can leave its own signal.",
            EXOMOON_EXAMPLE,
          ),
          predictPhase({
            id: "exomoon-step-1-predict",
            title: "Predict the moon crossing",
            prompt:
              "Predict what changing the moon inclination will do to the moon’s visibility on the stellar disk.",
            primaryLabel: "Prediction",
            secondaryLabel: "Why?",
          }),
          observePhase({
            id: "exomoon-step-1-observe",
            title: "Observe the moon geometry",
            prompt:
              "Jump to the moon event and record whether the moon really crosses the stellar disk from the current observer direction.",
            eventTarget: "moonMidTransit",
            checklist: [
              "Does the moon path overlap the stellar disk?",
              "Is the moon in front of the star when the dip occurs?",
              "Does the moon chord differ from the planet chord?",
            ],
          }),
          explainPhase({
            id: "exomoon-step-1-explain",
            title: "Explain the moon visibility",
            prompt:
              "Explain why a visible moon signal needs a front-of-star crossing rather than only a nearby orbit.",
          }),
          comparePhase({
            id: "exomoon-step-1-compare",
            title: "Compare moon-on and moon-off",
            prompt:
              "Use A/B compare with the moon enabled versus disabled and isolate which feature belongs to the moon.",
          }),
          reportPhase({
            id: "exomoon-step-1-report",
            title: "State the moon-visibility rule",
            prompt:
              "Summarize the geometric condition that must hold before a moon can contribute its own transit feature.",
          }),
        ],
      },
      {
        id: "exomoon-step-2",
        title: "Separate the moon signal from the planet transit",
        prompt:
          "Change the moon spacing until the moon's transit center is measurably offset from the planet's transit center. This creates a distinct leading or trailing moon signature.",
        checks: [
          {
            id: "moon-lead-lag",
            label: "|Δt_moon-planet| >= 600 s",
            kind: "distance",
            signal: "moonLeadLagSec",
            target: 0,
            minAbsDelta: 600,
          },
        ],
        phases: [
          predictPhase({
            id: "exomoon-step-2-predict",
            title: "Predict the lead/lag effect",
            prompt:
              "Predict how increasing moon spacing should change the relative timing of the moon and planet signals.",
            primaryLabel: "Prediction",
            secondaryLabel: "What change on the curve do you expect?",
          }),
          observePhase({
            id: "exomoon-step-2-observe",
            title: "Observe the timing offset",
            prompt:
              "Jump between the moon and planet transit centers and record whether the two signals are still merged or clearly separated.",
            eventTarget: "moonMidTransit",
            checklist: [
              "Does the moon lead or trail the planet?",
              "Can you point to a moon-only shoulder or dip?",
              "Is the timing offset large enough to read by eye?",
            ],
          }),
          explainPhase({
            id: "exomoon-step-2-explain",
            title: "Explain the separated signal",
            prompt:
              "Explain why temporal separation matters for identifying a moon signature in a light curve.",
          }),
          comparePhase({
            id: "exomoon-step-2-compare",
            title: "Confirm with A/B compare",
            prompt:
              "Use A/B compare at the same timestamp and state which morphology feature disappears when the moon is removed.",
          }),
          reportPhase({
            id: "exomoon-step-2-report",
            title: "Finalize the exomoon inference",
            prompt: "Write the rule that distinguishes a moon-caused feature from the main planet transit.",
          }),
        ],
      },
    ],
  },
  {
    id: "limb-darkening-lab",
    title: "Limb Darkening Lab",
    summary:
      "Investigate how quadratic limb darkening I(mu)/I(1) = 1 - u1(1-mu) - u2(1-mu)^2 modifies transit ingress/egress shape and apparent depth.",
    audience: "bachelor-master-stem",
    family: "stellar-surface",
    simMode: "preset-lab",
    recommendedUiMode: "expert",
    signalSurface: "physical",
    teachingGoal:
      "Show that where the body crosses the stellar disk matters because the stellar surface is not uniformly bright.",
    focusControls: ["quickPlanetInc", "quickPlanetR"],
    eventTargets: ["planetIngress", "planetMidTransit", "planetEgress"],
    learnerVocabulary: ["limb darkening", "ingress curvature", "brightness profile"],
    comparisonPrompt:
      "Compare a uniform-disk and strong limb-darkening setup at the same geometry to isolate shape changes in ingress and egress.",
    steps: [
      {
        id: "ld-step-1",
        title: "Apply a strong limb-darkening profile",
        prompt:
          "Increase u1 and u2 to create a pronounced centre-to-limb brightness variation, while keeping a transit visible in the light curve.",
        checks: [
          {
            id: "transit-on",
            label: "transit factor F < 1 (transit in progress)",
            kind: "range",
            signal: "fluxTransitFactor",
            max: 0.9999,
          },
        ],
        phases: [
          predictPhase({
            id: "ld-step-1-predict",
            title: "Predict the shape change",
            prompt:
              "Predict how stronger limb darkening should change ingress and egress compared with a uniform stellar disk.",
            primaryLabel: "Prediction",
            secondaryLabel: "Why?",
          }),
          observePhase({
            id: "ld-step-1-observe",
            title: "Observe ingress and egress curvature",
            prompt:
              "Use the event jumps and record how the curve shape changes near ingress and egress once limb darkening is strong.",
            eventTarget: "planetIngress",
            checklist: [
              "Does ingress bend more gradually than for a uniform disk?",
              "Does the stellar edge contribute less light than the center?",
              "Is the effect stronger in the curve shape than in the raw orbit geometry?",
            ],
          }),
          explainPhase({
            id: "ld-step-1-explain",
            title: "Explain the surface-brightness effect",
            prompt:
              "Explain why the same geometric transit can produce a different curve shape when the stellar disk is non-uniform.",
          }),
          comparePhase({
            id: "ld-step-1-compare",
            title: "Compare uniform and limb-darkened cases",
            prompt:
              "Use A/B compare between a weak and strong limb-darkening setup and state which part of the curve changes first.",
          }),
        ],
      },
      {
        id: "ld-step-2",
        title: "Compare observed depth to the geometric prediction",
        prompt:
          "With strong limb darkening, the physical transit depth will deviate from (Rp/R*)^2 because the occulted flux depends on where the planet crosses the disk. Note the difference and consider which direction it shifts.",
        checks: [
          {
            id: "depth-nonzero",
            label: "delta_physical > 0 (depth is measurable)",
            kind: "range",
            signal: "depthObserved",
            min: 1e-6,
          },
        ],
      },
    ],
  },
  {
    id: "nbody-perturber-lab",
    title: "N-Body Perturber Lab",
    summary:
      "Detect dynamical signatures of a third body (exomoon or additional planet) through stellar radial velocity (RV) and transit duration variations (TDV).",
    audience: "bachelor-master-stem",
    family: "dynamical-inference",
    simMode: "preset-lab",
    recommendedUiMode: "expert",
    signalSurface: "physical",
    teachingGoal:
      "Move from shape-based photometry intuition to dynamical inference by tracking timing and RV diagnostics.",
    focusControls: ["quickMoonEnabled", "quickMoonA", "quickMoonInc"],
    eventTargets: ["planetMidTransit", "planetEgress"],
    learnerVocabulary: ["RV", "TDV", "perturber", "dynamical signature"],
    comparisonPrompt:
      "Use A/B compare between the default lesson setup and a perturbed setup to separate purely photometric changes from dynamical timing changes.",
    steps: [
      {
        id: "nbody-step-1",
        title: "Generate a detectable stellar RV signal",
        prompt:
          "Enable N-body dynamics and configure the system so that the reflex motion of the star produces a radial velocity |RV*| > 0.01 m/s. Hint: the RV semi-amplitude scales with the companion mass and inversely with orbital period.",
        checks: [
          {
            id: "rv-star",
            label: "|RV*| > 0.01 m/s",
            kind: "range",
            signal: "rvStar",
            min: 0.01,
          },
        ],
      },
      {
        id: "nbody-step-2",
        title: "Observe a transit duration variation",
        prompt:
          "A perturbing body shifts the planet's sky-plane velocity between transits, changing the transit duration. Generate a measurable TDV signal (ratio deviating from 1.0).",
        checks: [
          {
            id: "tdv-neq-1",
            label: "TDV ratio != 1.0 (duration varies)",
            kind: "distance",
            signal: "tdvRatio",
            target: 1,
            minAbsDelta: 1e-4,
          },
        ],
      },
    ],
  },
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

export const DEFAULT_LESSON_ID = LESSONS[0].id;
const LESSON_BY_ID = new Map(LESSONS.map((lesson) => [lesson.id, lesson] as const));
const LESSONS_BY_SIM_MODE: Record<LessonSimMode, LessonSpec[]> = {
  "preset-lab": LESSONS.filter((lesson) => lesson.simMode === "either" || lesson.simMode === "preset-lab"),
  "binary-lab": LESSONS.filter((lesson) => lesson.simMode === "either" || lesson.simMode === "binary-lab"),
  either: LESSONS,
};

export function getLessonById(id: string | undefined): LessonSpec | undefined {
  if (!id) return LESSONS[0];
  return LESSON_BY_ID.get(id);
}

export function getLessonsForSimMode(mode: LessonSimMode): LessonSpec[] {
  return LESSONS_BY_SIM_MODE[mode];
}

export function getDefaultLessonIdForSimMode(mode: LessonSimMode): string {
  return getLessonsForSimMode(mode)[0]?.id ?? DEFAULT_LESSON_ID;
}

export function getLessonStepPhases(lesson: LessonSpec, stepIndex: number): LessonPhaseSpec[] {
  const safeIndex = Math.max(0, Math.min(stepIndex, Math.max(lesson.steps.length - 1, 0)));
  const step = lesson.steps[safeIndex];
  if (Array.isArray(step.phases) && step.phases.length > 0) return step.phases;
  return [
    {
      id: `${step.id}-observe`,
      type: "observe",
      title: step.title,
      prompt: step.prompt,
      responseMode: "observation-notes",
    },
  ];
}
